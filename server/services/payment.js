const path = require("path");
var paypal = require("paypal-rest-sdk");
var cors = require("cors");
var User = require("../models/user");
var Token = require("../models/tokenVerification");
var PaymentLogs = require("../models/payment_logs");
const emailer = require("../emailer/impl");
var crypto = require("crypto");
const IPFS = require("ipfs-http-client");
var ejs = require("ejs");
const utils = require("../utils.js");
const promoCodeService = require("../services/promoCodes");

// Need to understand the complete flow and handle erros, unexpected shutdowns, inaccessible 3rd party.

exports.payPaypalSuccess = (req, res, next) => {
  var paymentId = req.query.paymentId;
  var payerId = { payer_id: req.query.PayerID };
  var order;

  paypal.payment.execute(paymentId, payerId, function(error, payment) {
    if (error) {
      // Error in executing a payment.
      console.error(JSON.stringify(error));
      res.status(400).json(JSON.stringify(error));
    } else {
      if (
        payment.state === "approved" &&
        payment.transactions &&
        payment.transactions[0].related_resources &&
        payment.transactions[0].related_resources[0].order
      ) {
        console.log("order authorization completed successfully");
        order = payment.transactions[0].related_resources[0].order.id;
        console.log(payment.transactions[0].description);
        var email = payment.transactions[0].description;
        var course_id = payment.transactions[0].item_list.items[0].name;
        var invoice_number = payment.transactions[0].invoice_number;
        var capture_details = {
          amount: {
            currency: payment.transactions[0].amount.currency,
            total: payment.transactions[0].amount.total
          }
        };
        paypal.order.authorize(order, capture_details, function(
          error,
          authorization
        ) {
          if (error) {
            console.error(JSON.stringify(error));
            // res.status(500).json(JSON.stringify(error))
          } else {
            paypal.order.capture(order, capture_details, function(
              error,
              capture
            ) {
              if (error) {
                console.error(error);
                res.status(500).json(JSON.stringify(error));
              } else {
                console.log("ORDER CAPTURE SUCCESS");
                User.findOne({ email: req.user.email }, async function(
                  err,
                  user
                ) {
                  if (err != null) {
                    // res.status(500).json({error:JSON.stringify(err),msg:"database under maintenance"})
                    console.error(`Error: user not found || ${err}`);
                  }
                  if (course_id == "course_1")
                    user.examData.payment.course_1 = true;
                  else if (course_id == "course_2")
                    user.examData.payment.course_2 = true;
                  else if (course_id == "course_3")
                    user.examData.payment.course_3 = true;
                  user.save();
                  await PaymentLogs.findOne(
                    { payment_id: invoice_number, email: email },
                    function(err, payment_log) {
                      payment_log.payment_status = true;
                      payment_log.save();
                    }
                  );
                });
                console.log("course_id", course_id, email);
                emailer.sendTokenMail(email, "", req, course_id);
                res.redirect("/payment-success");
              }
            });
          }
        });
      } else {
        console.log("payment not successful");
        res.send({ error: error });
      }
    }
  });
};

exports.payPaypal = async (req, res) => {
  var price = req.body.price;
  var email = req.user.email;
  var course_id = req.body.course_id;
  var payment_status;
  const discObj = await promoCodeService.usePromoCode(req);
  console.log(discObj);
  console.log(typeof price);
  console.log(`Price Before : ${price}`);
  console.log(`Discount Price : ${discObj.discAmt}`);
  if (discObj.error == null) {
    // all good, can avail promo-code discount
    price = price - discObj.discAmt;
  }
  console.log(`Price After : ${price}`);
  price = Math.round(parseFloat(price) * 100) / 100;
  console.log(`Price : ${price}`);
  const user = await User.findOne({ email: email }, function(err) {
    if (err != null) {
      console.error(`Can't find user | access db; Err : ${err}`);
    }
  });
  if (course_id == "course_1") {
    payment_status = user.examData.payment.course_1;
  } else if (course_id == "course_2") {
    payment_status = user.examData.payment.course_2;
  } else if (course_id == "course_3") {
    payment_status = user.examData.payment.course_3;
  }
  if (price <= 0) {
    // free course !!
    if (!payment_status) {
      // if already not paid
      user.examData.payment[course_id] = true;
      user.save();
      return res.send({
        status: 201,
        message: "Course has been availed for free!"
      });
    }
  }

  if (payment_status != true) {
    invoice_number =
      "TXID" + Date.now() + (Math.floor(Math.random() * 1000) + 9999);
    var payReq = JSON.stringify({
      intent: "order",
      payer: {
        payment_method: "paypal"
      },
      redirect_urls: {
        return_url: `${process.env.HOST}/suc`,
        cancel_url: `${process.env.HOST}/err`
      },
      transactions: [
        {
          amount: {
            total: price,
            currency: "USD",
            details: {
              subtotal: price,
              tax: "0.0"
            }
          },
          description: email,
          invoice_number: invoice_number,
          payment_options: {
            allowed_payment_method: "INSTANT_FUNDING_SOURCE"
          },
          item_list: {
            items: [
              {
                name: course_id,
                quantity: "1",
                price: price,
                tax: "0.0",
                sku: "123123",
                currency: "USD"
              }
            ]
          }
        }
      ]
    });

    paypal.payment.create(payReq, function(error, payment) {
      var links = {};
      if (error) {
        console.error(JSON.stringify(error));
      } else {
        payment.links.forEach(function(linkObj) {
          links[linkObj.rel] = {
            href: linkObj.href,
            method: linkObj.method
          };
        });
        if (links.hasOwnProperty("approval_url")) {
          var payment_logs = new PaymentLogs();
          payment_logs.email = email;
          payment_logs.course_id = course_id;
          payment_logs.payment_id = invoice_number;
          payment_logs.payment_status = false;
          payment_logs.amount = price;
          payment_logs.save();

          return res.send({
            status: "200",
            link: links["approval_url"].href
          });
        } else {
          console.error("no redirect URI present");
        }
      }
    });
  } else {
    return res.send({ status: "400", message: "Payment already completed." });
  }
};

INSERT INTO sms_messages (recipient, guest_name, message, status, provider, template, segments, cost, error, created_at, sent_at)
VALUES
 ('+919812345601','Rohit Sharma','Welcome to Arco Palace! Your check-in OTP is 482913. Valid for 10 minutes.','delivered','msg91','checkin_otp',1,0.18,NULL,NOW() - INTERVAL '2 hours',  NOW() - INTERVAL '2 hours'),
 ('+919812345602','Neha Verma','Your room 204 is ready. Please collect your key from the front desk.','delivered','msg91','room_ready',1,0.18,NULL,NOW() - INTERVAL '5 hours',  NOW() - INTERVAL '5 hours'),
 ('+919812345603','Imran Khan','Check-out reminder: your stay ends today at 11:00 AM. Thank you for staying with us!','sent','msg91','checkout_reminder',1,0.18,NULL,NOW() - INTERVAL '9 hours', NOW() - INTERVAL '9 hours'),
 ('+919812345604','Priya Nair','Your check-in OTP is 771204. Valid for 10 minutes.','failed','msg91','checkin_otp',1,0.00,'DND number - delivery blocked', NOW() - INTERVAL '1 day', NULL),
 ('+919812345605','Arjun Mehta','Booking BK-10422 confirmed for 3 nights starting 24 Aug. See you soon!','delivered','msg91','booking_confirm',2,0.36,NULL,NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
 ('+919812345606','Sana Sheikh','Your check-in OTP is 330517. Valid for 10 minutes.','queued','msg91','checkin_otp',1,0.00,NULL,NOW() - INTERVAL '20 minutes', NULL),
 ('+919812345607','Vikram Rao','Invoice INV-88231 of Rs 7,450 has been emailed to you. Thanks for your visit!','delivered','textlocal','invoice',2,0.34,NULL,NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
 ('+919812345608','Meera Joshi','Your room 118 is ready. Please collect your key from the front desk.','delivered','textlocal','room_ready',1,0.17,NULL,NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
 ('+919812345609','Karan Gupta','Check-out reminder: your stay ends today at 11:00 AM.','failed','textlocal','checkout_reminder',1,0.00,'Invalid mobile number', NOW() - INTERVAL '3 days', NULL),
 ('+919812345610','Aditi Bansal','Welcome to Arco Palace! Your check-in OTP is 905611.','delivered','msg91','checkin_otp',1,0.18,NULL,NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
 ('+919812345611','Suresh Kumar','Booking BK-10390 confirmed for 1 night on 21 Aug.','delivered','msg91','booking_confirm',1,0.18,NULL,NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
 ('+919812345612','Fatima Ali','Your feedback matters! Rate your stay: https://checkin.co.in/r/BK10390','sent','msg91','feedback',1,0.18,NULL,NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days');

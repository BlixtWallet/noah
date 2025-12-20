# Add email verification during sign up flow.

We also want to collect user's email address during the registration process to send critical emails when needed. This email needs to be obviously verified on the server side.

We use AWS SES to send emails to the user's email address with a verification code. the user enters the code in the app to verify their email address and that completes the registration process.

We store the code we are sending to the user in redis and give it a TTL of 10 minutes.
In redis, we store the code like a `key: <user_pubkey>:email_verification_code value:<verification_code>`. Something like this.
If the user doesn't verify in 10 mins, they can request a new verification code.

We store the user's email address in the database.
We also store is_email_verified in the database as a boolean value.

Our server should not serve users without email verification.
So in the app they cannot get past the email verification step which comes after the saving seed phrase screen.
I suppose we can use react-native-confirmation-code-field, i already installed the dependency.

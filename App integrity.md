# App integrity from apple and google.

- We need to start implementing app integrity in our app to prevent spam attacked on our server with malicious key pairs being generated and destroy our database.
- We need to make sure requests are coming from our app only.

### Apple
For client side code, we can use this library i built in the past:
https://raw.githubusercontent.com/niteshbalusu11/react-native-secure-enclave-operations/refs/heads/master/README.md

It also has server side code, but it's written in Nodejs, obviously we need a rust version for our app.

### Google
For client side code, we can use this library I built in the past:
https://raw.githubusercontent.com/niteshbalusu11/react-native-secure-enclave-operations/refs/heads/master/README.md

It also has server side code, but it's written in Node.js, obviously we need a Rust version for our app.


- The goal is to have this API as part of our sign up flow.
- So we do an integrity check on the first time a user creates an account and registers their device.
- We don't block the user if the integrity check fails but we capture it in our database so we can look into it later.

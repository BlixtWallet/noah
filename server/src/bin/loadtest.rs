use goose::prelude::*;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};

static USER_COUNTER: AtomicU64 = AtomicU64::new(0);
static TEST_USER_LN_ADDRESS: OnceLock<String> = OnceLock::new();

#[derive(Serialize, Deserialize, Debug)]
struct GetK1Response {
    k1: String,
    tag: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct AppVersionCheckPayload {
    client_version: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct RegisterPayload {
    ln_address: Option<String>,
    ark_address: Option<String>,
    device_info: Option<DeviceInfo>,
}

#[derive(Serialize, Deserialize, Debug)]
struct DeviceInfo {
    device_manufacturer: Option<String>,
    device_model: Option<String>,
    os_name: Option<String>,
    os_version: Option<String>,
    app_version: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct RegisterResponse {
    status: String,
    event: Option<String>,
    reason: Option<String>,
    lightning_address: Option<String>,
}

struct TestUser {
    keypair: bitcoin::key::Keypair,
    secp: bitcoin::secp256k1::Secp256k1<bitcoin::secp256k1::All>,
}

impl TestUser {
    fn new_random() -> Self {
        let secp = bitcoin::secp256k1::Secp256k1::new();
        let mut rng = rand::rng();
        let mut key_bytes = [0u8; 32];
        rng.fill(&mut key_bytes);
        let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&key_bytes).unwrap();
        let keypair = bitcoin::key::Keypair::from_secret_key(&secp, &secret_key);
        Self { keypair, secp }
    }

    fn pubkey(&self) -> String {
        let pk: bitcoin::key::PublicKey = self.keypair.public_key().into();
        pk.to_string()
    }

    fn sign(&self, k1: &str) -> String {
        let hash = bitcoin::sign_message::signed_msg_hash(k1);
        let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..]).unwrap();
        let sig = self.secp.sign_ecdsa(&msg, &self.keypair.secret_key());
        sig.to_string()
    }
}

async fn setup_test_user(host: &str) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    let test_user = TestUser::new_random();

    // Get k1
    let k1_response: GetK1Response = client
        .get(format!("{}/v0/getk1", host))
        .send()
        .await?
        .json()
        .await?;

    let sig = test_user.sign(&k1_response.k1);

    // Don't specify ln_address - let server generate one with the correct domain
    let payload = RegisterPayload {
        ln_address: None,
        ark_address: None,
        device_info: None,
    };

    let response: RegisterResponse = client
        .post(format!("{}/v0/register", host))
        .header("Content-Type", "application/json")
        .header("x-auth-key", test_user.pubkey())
        .header("x-auth-sig", sig)
        .header("x-auth-k1", k1_response.k1)
        .json(&payload)
        .send()
        .await?
        .json()
        .await?;

    let address = response
        .lightning_address
        .ok_or_else(|| anyhow::anyhow!("Server didn't return lightning address"))?;

    // Extract username from lightning address (part before @)
    let username = address.split('@').next().unwrap_or("loadtest_user");

    println!(
        "Setup: Created test user with lightning address: {}",
        address
    );

    Ok(username.to_string())
}

// Public endpoint: GET /v0/getk1
async fn loadtest_get_k1(user: &mut GooseUser) -> TransactionResult {
    let _response = user.get_named("/v0/getk1", "get_k1").await?;
    Ok(())
}

// Public endpoint: POST /v0/app_version
async fn loadtest_check_app_version(user: &mut GooseUser) -> TransactionResult {
    let payload = AppVersionCheckPayload {
        client_version: "1.0.0".to_string(),
    };

    let request_builder = user
        .get_request_builder(&GooseMethod::Post, "/v0/app_version")?
        .header("Content-Type", "application/json")
        .body(serde_json::to_string(&payload).unwrap());

    let goose_request = GooseRequest::builder()
        .set_request_builder(request_builder)
        .name("app_version")
        .build();

    let _response = user.request(goose_request).await?;
    Ok(())
}

// Public endpoint: GET /.well-known/lnurlp/{username}
async fn loadtest_lnurlp_request(user: &mut GooseUser) -> TransactionResult {
    let username = TEST_USER_LN_ADDRESS
        .get()
        .map(|s| s.as_str())
        .unwrap_or("loadtest_user");

    let path = format!("/.well-known/lnurlp/{}", username);
    let _response = user.get_named(&path, "lnurlp").await?;
    Ok(())
}

// Private endpoint: GET /health (on private port)
async fn loadtest_health_check(user: &mut GooseUser) -> TransactionResult {
    let _response = user.get_named("/health", "health_check").await?;
    Ok(())
}

// Full registration flow: get k1 -> sign -> register
async fn loadtest_registration_flow(user: &mut GooseUser) -> TransactionResult {
    let test_user = TestUser::new_random();

    // Step 1: Get k1
    let response = user.get_named("/v0/getk1", "register_get_k1").await?;

    let k1_response: GetK1Response = match response.response {
        Ok(r) => {
            if !r.status().is_success() {
                return Ok(());
            }
            match r.json().await {
                Ok(json) => json,
                Err(_) => return Ok(()),
            }
        }
        Err(_) => return Ok(()),
    };

    // Step 2: Sign the k1
    let sig = test_user.sign(&k1_response.k1);

    // Step 3: Register
    let user_num = USER_COUNTER.fetch_add(1, Ordering::SeqCst);
    let payload = RegisterPayload {
        ln_address: Some(format!("loadtest{}@localhost", user_num)),
        ark_address: None,
        device_info: Some(DeviceInfo {
            device_manufacturer: Some("LoadTest".to_string()),
            device_model: Some(format!("loadtest-device-{}", user_num)),
            os_name: Some("Android".to_string()),
            os_version: Some("14".to_string()),
            app_version: Some("1.0.0".to_string()),
        }),
    };

    let request_builder = user
        .get_request_builder(&GooseMethod::Post, "/v0/register")?
        .header("Content-Type", "application/json")
        .header("x-auth-key", test_user.pubkey())
        .header("x-auth-sig", sig)
        .header("x-auth-k1", k1_response.k1)
        .body(serde_json::to_string(&payload).unwrap());

    let goose_request = GooseRequest::builder()
        .set_request_builder(request_builder)
        .name("register")
        .build();

    let _response = user.request(goose_request).await?;
    Ok(())
}

// Authenticated flow: get user info
async fn loadtest_get_user_info(user: &mut GooseUser) -> TransactionResult {
    let test_user = TestUser::new_random();

    // Get k1 and register first
    let response = user.get_named("/v0/getk1", "userinfo_get_k1_1").await?;

    let k1_response: GetK1Response = match response.response {
        Ok(r) => {
            if !r.status().is_success() {
                return Ok(());
            }
            match r.json().await {
                Ok(json) => json,
                Err(_) => return Ok(()),
            }
        }
        Err(_) => return Ok(()),
    };

    let sig = test_user.sign(&k1_response.k1);
    let user_num = USER_COUNTER.fetch_add(1, Ordering::SeqCst);

    let register_payload = RegisterPayload {
        ln_address: Some(format!("loadtestinfo{}@localhost", user_num)),
        ark_address: None,
        device_info: None,
    };

    let request_builder = user
        .get_request_builder(&GooseMethod::Post, "/v0/register")?
        .header("Content-Type", "application/json")
        .header("x-auth-key", test_user.pubkey())
        .header("x-auth-sig", sig)
        .header("x-auth-k1", &k1_response.k1)
        .body(serde_json::to_string(&register_payload).unwrap());

    let goose_request = GooseRequest::builder()
        .set_request_builder(request_builder)
        .name("userinfo_register")
        .build();

    let response = user.request(goose_request).await?;

    if let Ok(r) = &response.response {
        if !r.status().is_success() {
            return Ok(());
        }
    } else {
        return Ok(());
    }

    // Get a new k1 for the user_info request
    let response = user.get_named("/v0/getk1", "userinfo_get_k1_2").await?;

    let k1_response: GetK1Response = match response.response {
        Ok(r) => {
            if !r.status().is_success() {
                return Ok(());
            }
            match r.json().await {
                Ok(json) => json,
                Err(_) => return Ok(()),
            }
        }
        Err(_) => return Ok(()),
    };

    let sig = test_user.sign(&k1_response.k1);

    let request_builder = user
        .get_request_builder(&GooseMethod::Post, "/v0/user_info")?
        .header("Content-Type", "application/json")
        .header("x-auth-key", test_user.pubkey())
        .header("x-auth-sig", sig)
        .header("x-auth-k1", k1_response.k1)
        .body("{}");

    let goose_request = GooseRequest::builder()
        .set_request_builder(request_builder)
        .name("user_info")
        .build();

    let _response = user.request(goose_request).await?;
    Ok(())
}

// Scenario for public endpoints
fn build_public_scenario() -> Scenario {
    scenario!("Public Endpoints")
        .register_transaction(transaction!(loadtest_get_k1).set_weight(3).unwrap())
        .register_transaction(
            transaction!(loadtest_check_app_version)
                .set_weight(2)
                .unwrap(),
        )
        .register_transaction(transaction!(loadtest_lnurlp_request).set_weight(1).unwrap())
}

// Scenario for registration flow
fn build_registration_scenario() -> Scenario {
    scenario!("Registration Flow").register_transaction(
        transaction!(loadtest_registration_flow)
            .set_weight(1)
            .unwrap(),
    )
}

// Scenario for authenticated user operations
fn build_authenticated_scenario() -> Scenario {
    scenario!("Authenticated Operations")
        .register_transaction(transaction!(loadtest_get_user_info).set_weight(1).unwrap())
}

// Scenario for health check (private port)
fn build_health_scenario() -> Scenario {
    scenario!("Health Check").register_transaction(transaction!(loadtest_health_check))
}

#[tokio::main]
async fn main() -> Result<(), GooseError> {
    // Use LOADTEST_SCENARIO env var to select scenario
    // Available: public, registration, authenticated, health, all
    let scenario_name = std::env::var("LOADTEST_SCENARIO").unwrap_or_else(|_| "public".to_string());
    let scenario_name = scenario_name.as_str();

    let host =
        std::env::var("LOADTEST_HOST").unwrap_or_else(|_| "http://localhost:3000".to_string());

    // Setup: Create a test user for lnurlp tests
    if scenario_name == "public" || scenario_name == "all" {
        match setup_test_user(&host).await {
            Ok(username) => {
                let _ = TEST_USER_LN_ADDRESS.set(username);
            }
            Err(e) => {
                eprintln!("Warning: Failed to setup test user for lnurlp tests: {}", e);
                eprintln!("lnurlp tests will likely fail with 400 errors");
            }
        }
    }

    let mut attack = match scenario_name {
        "public" => GooseAttack::initialize()?.register_scenario(build_public_scenario()),
        "registration" => {
            GooseAttack::initialize()?.register_scenario(build_registration_scenario())
        }
        "authenticated" => {
            GooseAttack::initialize()?.register_scenario(build_authenticated_scenario())
        }
        "health" => GooseAttack::initialize()?.register_scenario(build_health_scenario()),
        "all" => GooseAttack::initialize()?
            .register_scenario(build_public_scenario())
            .register_scenario(build_registration_scenario()),
        _ => {
            eprintln!(
                "Unknown scenario: {}. Available: public, registration, authenticated, health, all",
                scenario_name
            );
            std::process::exit(1);
        }
    };

    attack = *attack.set_default(GooseDefault::Host, host.as_str())?;

    attack.execute().await?;
    Ok(())
}

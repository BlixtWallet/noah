use bitcoin::key::Keypair;

use crate::app_middleware::AuthPayload;

pub struct TestUser {
    keypair: Keypair,
    secp: bitcoin::secp256k1::Secp256k1<bitcoin::secp256k1::All>,
}

impl TestUser {
    pub fn new() -> Self {
        let secp = bitcoin::secp256k1::Secp256k1::new();
        let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&[0xcd; 32]).unwrap();
        let keypair = Keypair::from_secret_key(&secp, &secret_key);
        Self { keypair, secp }
    }

    pub fn pubkey(&self) -> bitcoin::key::PublicKey {
        self.keypair.public_key().into()
    }

    pub fn auth_payload(&self, k1: &str) -> AuthPayload {
        let hash = bitcoin::sign_message::signed_msg_hash(k1);
        let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..]).unwrap();
        let sig = self.secp.sign_ecdsa(&msg, &self.keypair.secret_key());
        AuthPayload {
            key: self.pubkey().to_string(),
            sig: sig.to_string(),
            k1: k1.to_string(),
        }
    }
}

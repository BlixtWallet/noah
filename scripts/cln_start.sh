#!/bin/sh
set -e

lightningd --${NETWORK} --log-level=debug --grpc-host=0.0.0.0 \
	--wallet=postgres://postgres:postgres@postgres:5432/cln \
	--bookkeeper-db=postgres://postgres:postgres@postgres:5432/cln \
	--bitcoin-rpcconnect=${BITCOIN_RPCCONNECT} --bitcoin-rpcuser=${BITCOIN_RPCUSER} --bitcoin-rpcpassword=${BITCOIN_RPCPASSWORD} \
	--important-plugin=/plugins/hold --hold-grpc-host=0.0.0.0 --hold-grpc-port=9988 &
LIGHTNINGD_PID=$!

WAIT_FILE="/root/.lightning/${NETWORK}/hold/ca.pem"
GEN_MARKER="/root/.lightning/${NETWORK}/hold/generation.done"

echo "Waiting for ${WAIT_FILE}..."
while [ ! -f "${WAIT_FILE}" ]; do
	sleep 1s
done

echo "Found file ${WAIT_FILE}"
if [ ! -f "${GEN_MARKER}" ]; then
	rm -f /root/.lightning/${NETWORK}/hold/server-key.pem
	rm -f /root/.lightning/${NETWORK}/hold/server.pem
	echo "Generating custom server certificate..."
	cat > /root/.lightning/${NETWORK}/hold/v3.ext <<EOF
[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = cln
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

	openssl ecparam -name prime256v1 -genkey -noout -out /root/.lightning/${NETWORK}/hold/server-key.pem
	openssl req \
		-key /root/.lightning/${NETWORK}/hold/server-key.pem -new \
		-out /root/.lightning/${NETWORK}/hold/server.csr \
		-subj "/C=US/ST=California/L=SanFrancisco/O=Second/OU=Dev/CN=cln"
	openssl x509 -req \
		-CA /root/.lightning/${NETWORK}/hold/ca.pem -CAkey /root/.lightning/${NETWORK}/hold/ca-key.pem \
		-in /root/.lightning/${NETWORK}/hold/server.csr \
		-out /root/.lightning/${NETWORK}/hold/server.pem \
		-days 3650 -CAcreateserial \
		-extfile /root/.lightning/${NETWORK}/hold/v3.ext -extensions v3_req

	openssl x509 -in /root/.lightning/${NETWORK}/hold/server.pem -text -noout
	openssl verify -CAfile /root/.lightning/${NETWORK}/hold/ca.pem /root/.lightning/${NETWORK}/hold/server.pem

	touch "${GEN_MARKER}"

	echo "Generation done rebooting"
	kill ${LIGHTNINGD_PID} || echo "Warning: lightningd might have exited before kill"
	sleep 1s

	echo "Booting"
	lightningd --${NETWORK} --log-level=debug --grpc-host=0.0.0.0 \
		--wallet=postgres://postgres:postgres@postgres:5432/cln \
		--bookkeeper-db=postgres://postgres:postgres@postgres:5432/cln \
		--bitcoin-rpcconnect=${BITCOIN_RPCCONNECT} --bitcoin-rpcuser=${BITCOIN_RPCUSER} --bitcoin-rpcpassword=${BITCOIN_RPCPASSWORD} \
		--important-plugin=/plugins/hold --hold-grpc-host=0.0.0.0 --hold-grpc-port=9988
else
	wait ${LIGHTNINGD_PID}
fi

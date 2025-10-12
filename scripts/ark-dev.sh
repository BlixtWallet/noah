#!/bin/bash

# A complete bootstrap and management script for the Ark dev environment.
#
# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
# This script assumes it lives one level above the 'bark' repo directory.
# The 'setup' command will create this structure.
REPO_DIR="bark"
COMPOSE_FILE="$REPO_DIR/contrib/docker/docker-compose.yml"

BITCOIND_SERVICE="bitcoind"
ASPD_SERVICE="captaind"
BARK_SERVICE="bark"
CLN_SERVICE="cln"

# LND Configuration
LND_CONTAINER="lnd-regtest-dev"
LND_IMAGE="lightninglabs/lnd:v0.19.3-beta"
LND_VOLUME="lnd-data"
LND_BITCOIND_HOST="host.docker.internal"
LND_BITCOIND_RPCPORT="18443"
LND_BITCOIND_RPCUSER="second"
LND_BITCOIND_RPCPASS="ark"

# Bitcoin Core wallet name to be used by this script
WALLET_NAME="dev-wallet"

# Bitcoin-cli options (matches the user/pass from the docker-compose.yml healthcheck)
BITCOIN_CLI_OPTS="-regtest -rpcuser=second -rpcpassword=ark -rpcwallet=$WALLET_NAME"

# Noah server configuration
NOAH_SERVER_IMAGE="ghcr.io/blixtwallet/noah-server:latest"
NOAH_SERVER_CONTAINER="noah-server-dev"
NOAH_SERVER_CONFIG_DIR=".noah-server"
NOAH_SERVER_CONFIG_FILE="$NOAH_SERVER_CONFIG_DIR/config.toml"
# --- End Configuration ---


# Helper function to avoid repeating the long docker-compose command
dcr() {
    docker-compose -f "$COMPOSE_FILE" "$@"
}

# --- Functions ---

# Displays how to use the script
usage() {
    echo "A bootstrap and management script for the Ark dev environment."
    echo ""
    echo "Usage: $0 <command> [arguments]"
    echo ""
    echo "SETUP:"
    echo "  setup                      Clone the bark repo and checkout the correct version."
    echo "  setup-everything           Run complete setup: setup, up, create-wallet, generate 150, fund-aspd 1, create-bark-wallet, start noah-server."
    echo ""
    echo "LIFECYCLE COMMANDS (run after 'setup'):"
    echo "  up                         Start all services in the background (docker-compose up -d)."
    echo "  stop                       Stop all services (docker-compose stop)."
    echo "  down                       Stop and remove all services (docker-compose down) and noah-server."
    echo ""
    echo "MANAGEMENT COMMANDS (run while services are 'up'):"
    echo "  create-wallet              Create and load a new wallet in bitcoind named '$WALLET_NAME'."
    echo "  create-bark-wallet         Create a new bark wallet with pre-configured dev settings."
    echo "  generate <num_blocks>      Mine blocks on bitcoind. Creates wallet if it doesn't exist."
    echo "  fund-aspd <amount>         Send <amount> of BTC from bitcoind to the ASPD wallet."
    echo "  send-to <addr> <amt>       Send <amt> BTC from bitcoind to <addr> and mine 1 block."
    echo "  aspd <args...>             Execute a command on the running aspd container."
    echo "  bark <args...>             Execute a command on a new bark container."
    echo "  create-noah-config         Create Noah server config file."
    echo "  start-noah-server          Start the Noah server container."
    echo "  stop-noah-server           Stop and remove the Noah server container."
    echo "  start-lnd                  Start LND node in regtest mode."
    echo "  stop-lnd                   Stop and remove LND container."
    echo "  lncli <args...>            Execute lncli commands on the running LND container."
    echo "  cln <args...>              Execute lightning-cli commands on the running CLN container."
}

# Clones the repository and checks out the correct tag.
setup_environment() {
    local repo_url="https://codeberg.org/ark-bitcoin/bark.git"
    local repo_tag="bark-0.1.0-beta.1"

    if ! command -v git &> /dev/null; then
        echo "Error: 'git' is not installed. Please install it to continue." >&2
        exit 1
    fi

    if [ -d "$REPO_DIR" ]; then
        echo "✅ Directory '$REPO_DIR' already exists. Setup is likely complete."
        echo "To re-run setup, please remove the '$REPO_DIR' directory first."
        return
    fi

    echo "Cloning repository '$repo_url' into './$REPO_DIR'..."
    git clone --branch "$repo_tag" "$repo_url" "$REPO_DIR"

    dcr pull

    echo "✅ Setup complete. You can now run management commands."
}

# Creates a new wallet in bitcoind if it doesn't already exist
create_wallet() {
    echo "Checking for bitcoind wallet '$WALLET_NAME'..."
    if dcr exec "$BITCOIND_SERVICE" bitcoin-cli -regtest -rpcuser=second -rpcpassword=ark listwallets | grep -q "\"$WALLET_NAME\""; then
        echo "✅ Wallet '$WALLET_NAME' already exists."

    # Else if attempt to load wallet
    elif dcr exec "$BITCOIND_SERVICE" bitcoin-cli -regtest -rpcuser=second -rpcpassword=ark loadwallet "$WALLET_NAME"; then
        echo "✅ Wallet '$WALLET_NAME' loaded successfully."

    elif dcr exec "$BITCOIND_SERVICE" bitcoin-cli -regtest -rpcuser=second -rpcpassword=ark createwallet "$WALLET_NAME"; then
        echo "✅ Wallet '$WALLET_NAME' created successfully."

    else
        echo "Failed to create wallet '$WALLET_NAME'."
    fi
}

# Creates a new bark wallet with default dev settings
create_bark_wallet() {
    echo "Creating a new bark wallet with dev settings..."
    dcr run --rm "$BARK_SERVICE" bark create \
        --regtest \
        --ark http://captaind:3535 \
        --bitcoind http://bitcoind:18443 \
        --bitcoind-user second \
        --bitcoind-pass ark \
        --force \
        --fallback-fee-rate 10000
    echo "✅ Bark wallet created. You can now use './ark-dev.sh bark <command>'."
}

# Generates blocks using the bitcoind container
generate_blocks() {
    local blocks="$1"
    create_wallet

    echo "⛏️  Generating $blocks blocks on bitcoind..."
    local address
    address=$(dcr exec "$BITCOIND_SERVICE" bitcoin-cli $BITCOIN_CLI_OPTS getnewaddress)
    dcr exec "$BITCOIND_SERVICE" bitcoin-cli $BITCOIN_CLI_OPTS generatetoaddress "$blocks" "$address"
    echo "✅ Done. $blocks blocks generated."
}

# Sends funds from the bitcoind wallet to a specified address
send_to_address() {
    local address="$1"
    local amount="$2"
    create_wallet

    echo "➡️  Sending $amount BTC to address: $address..."
    local txid
    txid=$(dcr exec "$BITCOIND_SERVICE" bitcoin-cli $BITCOIN_CLI_OPTS sendtoaddress "$address" "$amount")
    echo "💸 Transaction sent with TXID: $txid"

    echo "Confirming transaction..."
    generate_blocks 1
}

# Funds the ASPD wallet from the bitcoind wallet
fund_aspd() {
    local amount="$1"

    if ! command -v jq &> /dev/null; then
        echo "Error: 'jq' is not installed. Please install it to continue." >&2
        exit 1
    fi

    echo "🔍 Getting ASPD wallet address..."
    local aspd_address
    aspd_address=$(dcr exec "$ASPD_SERVICE" "$ASPD_SERVICE" rpc wallet | jq -r '.rounds.address')

    if [[ -z "$aspd_address" || "$aspd_address" == "null" ]]; then
        echo "Error: Could not retrieve ASPD wallet address. Is the aspd container running?" >&2
        exit 1
    fi

    send_to_address "$aspd_address" "$amount"
}

# Creates a Noah server config file for regtest
create_noah_server_config() {
    echo "Creating Noah server config..."

    mkdir -p "$NOAH_SERVER_CONFIG_DIR"

    cat > "$NOAH_SERVER_CONFIG_FILE" << 'EOF'
# Noah Server Test Configuration (Regtest)
host = "0.0.0.0"
port = 3000
private_port = 3099
lnurl_domain = "localhost"
turso_url = "file:local.db"
turso_api_key = "test-api-key"
expo_access_token = "test-expo-token"
ark_server_url = "http://host.docker.internal:3535"
server_network = "regtest"
backup_cron = "every 24 hours"
heartbeat_cron = "every 24 hours"
deregistration_cron = "every 24 hours"
maintenance_interval_rounds = 1
s3_bucket_name = "test-bucket"
minimum_app_version = "0.0.1"
EOF

    echo "✅ Noah server config created at $NOAH_SERVER_CONFIG_FILE"
}

# Starts the Noah server container
start_noah_server() {
    echo "🚀 Starting Noah server..."

    # Stop existing container if running
    if docker ps -a --format '{{.Names}}' | grep -q "^${NOAH_SERVER_CONTAINER}$"; then
        echo "Removing existing Noah server container..."
        docker rm -f "$NOAH_SERVER_CONTAINER" > /dev/null 2>&1 || true
    fi

    # Create config if it doesn't exist
    if [ ! -f "$NOAH_SERVER_CONFIG_FILE" ]; then
        create_noah_server_config
    fi

    # Pull latest image
    echo "Pulling Noah server image..."
    docker pull "$NOAH_SERVER_IMAGE"

    # Start container
    echo "Starting Noah server container..."
    docker run -d \
        --name "$NOAH_SERVER_CONTAINER" \
        -p 3000:3000 \
        -p 3099:3099 \
        --add-host=host.docker.internal:host-gateway \
        -v "$(pwd)/$NOAH_SERVER_CONFIG_FILE:/etc/server/config.toml:ro" \
        "$NOAH_SERVER_IMAGE"

    echo "✅ Noah server started at http://localhost:3000"
    echo "   Health check: http://localhost:3099/health"
}

# Stops and removes the Noah server container
stop_noah_server() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${NOAH_SERVER_CONTAINER}$"; then
        echo "🛑 Stopping Noah server..."
        docker rm -f "$NOAH_SERVER_CONTAINER" > /dev/null 2>&1 || true
        echo "✅ Noah server stopped."
    else
        echo "ℹ️  Noah server is not running."
    fi
}

# Starts the LND container in regtest mode
start_lnd() {
    echo "🚀 Starting LND node in regtest mode..."

    # Stop existing container if running
    if docker ps -a --format '{{.Names}}' | grep -q "^${LND_CONTAINER}$"; then
        echo "Removing existing LND container..."
        docker rm -f "$LND_CONTAINER" > /dev/null 2>&1 || true
    fi

    # Pull latest image
    echo "Pulling LND image..."
    docker pull "$LND_IMAGE"

    # Start container
    echo "Starting LND container..."
    docker run -d \
        --name "$LND_CONTAINER" \
        -p 9735:9735 \
        -p 10009:10009 \
        --add-host=host.docker.internal:host-gateway \
        -v "$LND_VOLUME:/root/.lnd" \
        "$LND_IMAGE" \
        --bitcoin.regtest \
        --bitcoin.node=bitcoind \
        --bitcoind.rpcpolling \
        --bitcoind.rpchost="$LND_BITCOIND_HOST:$LND_BITCOIND_RPCPORT" \
        --bitcoind.rpcuser="$LND_BITCOIND_RPCUSER" \
        --bitcoind.rpcpass="$LND_BITCOIND_RPCPASS" \
        --debuglevel=info \
        --noseedbackup

    echo "⏳ Waiting for LND to start..."
    sleep 5

    echo "✅ LND started successfully"
    echo "   RPC Port: 10009"
    echo "   P2P Port: 9735"
    echo ""
    echo "Note: Update the placeholder flags in the script:"
    echo "  - <BITCOIND_RPC_PORT>"
    echo "  - <BITCOIND_RPC_USER>"
    echo "  - <BITCOIND_RPC_PASS>"
    echo "  - <ZMQ_RAWBLOCK_PORT>"
    echo "  - <ZMQ_RAWTX_PORT>"
}

# Stops and removes the LND container
stop_lnd() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${LND_CONTAINER}$"; then
        echo "🛑 Stopping LND node..."
        docker rm -f "$LND_CONTAINER" > /dev/null 2>&1 || true
        echo "✅ LND stopped."
    else
        echo "ℹ️  LND is not running."
    fi
}

# Runs the complete setup sequence
setup_everything() {
    echo "🚀 Running complete setup sequence..."

    setup_environment

    echo ""
    echo "🚀 Starting Ark services..."
    dcr up -d

    echo ""
    echo "⏳ Waiting for services to be ready..."
    sleep 10

    echo ""
    create_wallet

    echo ""
    generate_blocks 150

    echo ""
    fund_aspd 1

    echo ""
    create_bark_wallet

    echo ""
    start_noah_server

    echo ""
    start_lnd

    echo ""
    echo "🎉 Complete setup finished successfully!"
    echo "Your Ark dev environment is ready to use."
    echo ""
    echo "Services running:"
    echo "  - Bitcoin Core (regtest): http://localhost:18443"
    echo "  - ASPD (Ark Server): http://localhost:3535"
    echo "  - Noah Server: http://localhost:3000"
    echo "  - Noah Server Health: http://localhost:3099/health"
    echo "  - LND (Lightning): RPC at localhost:10009, P2P at localhost:9735"
}

# --- Main Logic ---

COMMAND=$1

if [[ -z "$COMMAND" ]]; then
    usage
    exit 1
fi

# For any command other than 'setup' or 'setup-everything', ensure the environment is actually set up.
if [[ "$COMMAND" != "setup" && "$COMMAND" != "setup-everything" && ! -f "$COMPOSE_FILE" ]]; then
    echo "Error: Environment not found at '$COMPOSE_FILE'." >&2
    echo "Please run './ark-dev.sh setup' first." >&2
    exit 1
fi

shift

case "$COMMAND" in
    setup)
        setup_environment
        ;;

    setup-everything)
        setup_everything
        ;;

    up)
        echo "🚀 Starting Ark services in the background..."
        dcr up -d "$@"
        echo ""
        start_lnd
        ;;

    stop)
        echo "🛑 Stopping Ark services..."
        dcr stop "$@"
        stop_lnd
        ;;

    down)
        echo "🛑 Stopping and removing Ark services..."
        dcr down "$@" --volumes
        stop_noah_server
        stop_lnd

        if docker volume ls -q | grep -q "^${LND_VOLUME}$"; then
            echo "🗑️  Removing LND volume..."
            docker volume rm "$LND_VOLUME"
            echo "✅ LND volume removed."
        fi
        ;;

    start-noah-server)
        start_noah_server
        ;;

    stop-noah-server)
        stop_noah_server
        ;;

    start-lnd)
        start_lnd
        ;;

    stop-lnd)
        stop_lnd
        ;;

    create-noah-config)
        create_noah_server_config
        ;;

    create-wallet)
        create_wallet
        ;;

    create-bark-wallet)
        create_bark_wallet
        ;;

    generate)
        num_blocks=${1:-101}
        generate_blocks "$num_blocks"
        ;;

    fund-aspd)
        if [[ -z "$1" ]]; then
            echo "Error: Please provide an amount to send." >&2; usage; exit 1
        fi
        fund_aspd "$1"
        ;;

    send-to)
        if [[ -z "$1" || -z "$2" ]]; then
            echo "Error: Please provide both an address and an amount." >&2; usage; exit 1
        fi
        send_to_address "$1" "$2"
        ;;

    aspd)
        echo "Running command on aspd: $@"
        dcr exec "$ASPD_SERVICE" "$ASPD_SERVICE" "$@"
        ;;

    bark)
        echo "Running command on bark: bark $@"
        dcr run --rm "$BARK_SERVICE" "bark" "$@"
        ;;

    bcli)
        echo "Running bitcoin-cli command: $@"
        dcr exec "$BITCOIND_SERVICE" bitcoin-cli $BITCOIN_CLI_OPTS "$@"
        ;;

    lncli)
        echo "Running lncli command: $@"
        docker exec "$LND_CONTAINER" lncli --network=regtest "$@"
        ;;

    cln)
        echo "Running lightning-cli command: $@"
        dcr exec "$CLN_SERVICE" lightning-cli --regtest "$@"
        ;;

    *)
        echo "Error: Unknown command '$COMMAND'" >&2
        usage
        exit 1
        ;;
esac

# Don't print success message for passthrough or lifecycle commands
if [[ "$COMMAND" != "aspd" && "$COMMAND" != "bark" && "$COMMAND" != "setup" && "$COMMAND" != "up" && "$COMMAND" != "down" ]]; then
    echo "🎉 Script finished successfully."
fi

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

# Bitcoin Core wallet name to be used by this script
WALLET_NAME="dev-wallet"

# Bitcoin-cli options (matches the user/pass from the docker-compose.yml healthcheck)
BITCOIN_CLI_OPTS="-regtest -rpcuser=second -rpcpassword=ark -rpcwallet=$WALLET_NAME"
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
    echo ""
    echo "LIFECYCLE COMMANDS (run after 'setup'):"
    echo "  up                         Start all services in the background (docker-compose up -d)."
    echo "  stop                       Stop all services (docker-compose stop)."
    echo "  down                       Stop and remove all services (docker-compose down)."
    echo ""
    echo "MANAGEMENT COMMANDS (run while services are 'up'):"
    echo "  create-wallet              Create and load a new wallet in bitcoind named '$WALLET_NAME'."
    echo "  create-bark-wallet         Create a new bark wallet with pre-configured dev settings."
    echo "  generate <num_blocks>      Mine blocks on bitcoind. Creates wallet if it doesn't exist."
    echo "  fund-aspd <amount>         Send <amount> of BTC from bitcoind to the ASPD wallet."
    echo "  send-to <addr> <amt>       Send <amt> BTC from bitcoind to <addr> and mine 1 block."
    echo "  aspd <args...>             Execute a command on the running aspd container."
    echo "  bark <args...>             Execute a command on a new bark container."
}

# Clones the repository and checks out the correct tag.
setup_environment() {
    local repo_url="https://codeberg.org/ark-bitcoin/bark.git"
    local repo_tag="bark-0.0.0-alpha.20"

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


# --- Main Logic ---

COMMAND=$1

if [[ -z "$COMMAND" ]]; then
    usage
    exit 1
fi

# For any command other than 'setup', ensure the environment is actually set up.
if [[ "$COMMAND" != "setup" && ! -f "$COMPOSE_FILE" ]]; then
    echo "Error: Environment not found at '$COMPOSE_FILE'." >&2
    echo "Please run './ark-dev.sh setup' first." >&2
    exit 1
fi

shift

case "$COMMAND" in
    setup)
        setup_environment
        ;;

    up)
        echo "🚀 Starting Ark services in the background..."
        dcr up -d "$@"
        ;;

    stop)
        echo "🛑 Stopping and removing Ark services..."
        dcr stop "$@"
        ;;

    down)
        echo "🛑 Stopping and removing Ark services..."
        dcr down "$@" --volumes
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

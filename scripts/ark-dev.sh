#!/bin/bash

# A simple dev script for managing the Ark docker environment.
# Contains helper commands to manage the environment.
#
# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
COMPOSE_FILE="contrib/docker/docker-compose.yml"
BITCOIND_SERVICE="bitcoind"
ASPD_SERVICE="aspd"
BARK_SERVICE="bark"

# Bitcoin Core wallet name to be used by this script
WALLET_NAME="dev-wallet"

# Bitcoin-cli options (matches the user/pass from the docker-compose.yml healthcheck)
# We add the -rpcwallet flag to target our specific wallet for all commands.
BITCOIN_CLI_OPTS="-regtest -rpcuser=second -rpcpassword=ark -rpcwallet=$WALLET_NAME"
# --- End Configuration ---


# Helper function to avoid repeating the long docker-compose command
dcr() {
    docker-compose -f "$COMPOSE_FILE" "$@"
}

# --- Functions ---

# Displays how to use the script
usage() {
    echo "Usage: $0 <command> [arguments]"
    echo ""
    echo "Commands:"
    echo "  create-wallet              Create and load a new wallet in bitcoind named '$WALLET_NAME'."
    echo "  create-bark-wallet         Create a new bark wallet with pre-configured dev settings."
    echo "  generate <num_blocks>      Mine blocks on bitcoind. Creates wallet if it doesn't exist."
    echo "                               Default: 101 to mature the coinbase."
    echo "  fund-aspd <amount>         Send <amount> of BTC from bitcoind to the ASPD wallet."
    echo "  send-to <addr> <amt>       Send <amt> BTC from bitcoind to <addr> and mine 1 block."
    echo "  aspd <args...>             Execute a command on the running aspd container."
    echo "  bark <args...>             Execute a command on a new bark container."
    echo ""
    echo "Examples:"
    echo "  ./ark-dev.sh create-wallet"
    echo "  ./ark-dev.sh create-bark-wallet"
    echo "  ./ark-dev.sh generate 101"
    echo "  ./ark-dev.sh fund-aspd 0.5"
    echo "  ./ark-dev.sh send-to bcrt1q... 0.1"
    echo "  ./ark-dev.sh aspd aspd rpc wallet --help"
    echo "  ./ark-dev.sh bark ark-info"
}

# Creates a new wallet in bitcoind if it doesn't already exist
create_wallet() {
    echo "Checking for bitcoind wallet '$WALLET_NAME'..."
    if dcr exec "$BITCOIND_SERVICE" bitcoin-cli -regtest -rpcuser=second -rpcpassword=ark listwallets | grep -q "\"$WALLET_NAME\""; then
        echo "✅ Wallet '$WALLET_NAME' already exists."
    else
        echo "Wallet not found. Creating wallet '$WALLET_NAME'..."
        dcr exec "$BITCOIND_SERVICE" bitcoin-cli -regtest -rpcuser=second -rpcpassword=ark createwallet "$WALLET_NAME"
        echo "✅ Wallet '$WALLET_NAME' created successfully."
    fi
}

# Creates a new bark wallet with default dev settings
create_bark_wallet() {
    echo "Creating a new bark wallet with dev settings..."
    # Note: We use 'run --rm' as this is a one-off setup command.
    # The arguments are specific to the dev environment (aspd, bitcoind services).
    dcr run --rm "$BARK_SERVICE" bark create \
        --regtest \
        --asp http://aspd:3535 \
        --bitcoind http://bitcoind:18443 \
        --bitcoind-user second \
        --bitcoind-pass ark \
        --force \
        --fallback-fee-rate 100000
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
    aspd_address=$(dcr exec "$ASPD_SERVICE" aspd rpc wallet | jq -r '.rounds.address')

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

shift

case "$COMMAND" in
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
        dcr exec "$ASPD_SERVICE" "$@"
        ;;

    bark)
        echo "Running command on bark: bark $@"
        # The 'bark' executable must be the first argument inside the container
        dcr run --rm "$BARK_SERVICE" "bark" "$@"
        ;;

    *)
        echo "Error: Unknown command '$COMMAND'" >&2
        usage
        exit 1
        ;;
esac

# Don't print success message for passthrough commands
if [[ "$COMMAND" != "aspd" && "$COMMAND" != "bark" ]]; then
    echo "🎉 Script finished successfully."
fi

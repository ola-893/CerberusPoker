#!/bin/bash

# CerberusPoker Development Starter
# This script starts everything needed for local development

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "🎴 CerberusPoker Development Environment"
echo "========================================"
echo -e "${NC}"

# Check if validator is already running
if lsof -Pi :8899 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}✅ Validator is already running${NC}"
else
    echo -e "${YELLOW}⚠️  Validator is not running${NC}"
    echo -e "${BLUE}Starting validator in background...${NC}"
    
    # Start validator in background
    solana-test-validator > /dev/null 2>&1 &
    VALIDATOR_PID=$!
    
    echo -e "${GREEN}✅ Validator started (PID: $VALIDATOR_PID)${NC}"
    echo -e "${YELLOW}Waiting for validator to be ready...${NC}"
    
    # Wait for validator to be ready
    for i in {1..30}; do
        if solana cluster-version >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Validator is ready${NC}"
            break
        fi
        sleep 1
        echo -n "."
    done
    echo ""
fi

# Check if programs are deployed
echo -e "${BLUE}Checking if programs are deployed...${NC}"

if solana account Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Programs are deployed${NC}"
else
    echo -e "${YELLOW}⚠️  Programs not deployed${NC}"
    echo -e "${BLUE}Building and deploying programs...${NC}"
    
    cd packages/programs
    anchor build
    anchor deploy
    cd ../..
    
    echo -e "${GREEN}✅ Programs deployed${NC}"
    echo -e "${YELLOW}⚠️  You may need to update program IDs in:${NC}"
    echo -e "   - packages/programs/Anchor.toml"
    echo -e "   - examples/poker-ui/src/lib/anchor.ts"
fi

# Start frontend
echo -e "${BLUE}Starting frontend...${NC}"
cd examples/poker-ui

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    npm install
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${BLUE}Creating .env file...${NC}"
    cat > .env << EOF
VITE_RPC_URL=http://localhost:8899
VITE_CLUSTER_OFFSET=0
EOF
fi

echo -e "${GREEN}✅ Starting frontend dev server...${NC}"
echo -e "${CYAN}Frontend will be available at: http://localhost:5173${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

npm run dev

#!/bin/bash

# CerberusPoker Setup Verification Script
# Checks if all prerequisites are installed correctly

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "🔍 CerberusPoker Setup Verification"
echo "===================================="
echo -e "${NC}"

ERRORS=0

# Function to check command
check_command() {
    local cmd=$1
    local name=$2
    local required_version=$3
    
    if command -v $cmd &> /dev/null; then
        local version=$($cmd --version 2>&1 | head -n 1)
        echo -e "${GREEN}✅ $name is installed${NC}"
        echo -e "   Version: $version"
        
        if [ ! -z "$required_version" ]; then
            if [[ $version == *"$required_version"* ]]; then
                echo -e "   ${GREEN}Version matches requirement ($required_version)${NC}"
            else
                echo -e "   ${YELLOW}⚠️  Expected version $required_version${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ $name is NOT installed${NC}"
        ERRORS=$((ERRORS + 1))
    fi
    echo ""
}

# Check Node.js
echo -e "${BLUE}Checking Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 20 ]; then
        echo -e "${GREEN}✅ Node.js is installed (v$(node --version | cut -d'v' -f2))${NC}"
    else
        echo -e "${YELLOW}⚠️  Node.js version is $(node --version), but v20+ is recommended${NC}"
    fi
else
    echo -e "${RED}❌ Node.js is NOT installed${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check npm
check_command "npm" "npm"

# Check Rust
check_command "rustc" "Rust" "1.89.0"

# Check Cargo
check_command "cargo" "Cargo"

# Check Solana CLI
check_command "solana" "Solana CLI" "2.3.0"

# Check Anchor CLI
check_command "anchor" "Anchor CLI" "0.32.1"

# Check Arcium CLI (optional)
if command -v arcium &> /dev/null; then
    check_command "arcium" "Arcium CLI" "0.9.7"
else
    echo -e "${YELLOW}⚠️  Arcium CLI is not installed (optional for MXE development)${NC}"
    echo ""
fi

# Check Docker (optional)
if command -v docker &> /dev/null; then
    check_command "docker" "Docker"
else
    echo -e "${YELLOW}⚠️  Docker is not installed (optional for MXE testing)${NC}"
    echo ""
fi

# Check if Solana config exists
echo -e "${BLUE}Checking Solana configuration...${NC}"
if [ -f "$HOME/.config/solana/cli/config.yml" ]; then
    echo -e "${GREEN}✅ Solana config exists${NC}"
    SOLANA_URL=$(solana config get | grep "RPC URL" | awk '{print $3}')
    echo -e "   Current RPC URL: $SOLANA_URL"
else
    echo -e "${YELLOW}⚠️  Solana config not found${NC}"
    echo -e "   Run: solana config set --url localhost"
fi
echo ""

# Check if wallet exists
echo -e "${BLUE}Checking Solana wallet...${NC}"
if [ -f "$HOME/.config/solana/id.json" ]; then
    echo -e "${GREEN}✅ Solana wallet exists${NC}"
    WALLET_ADDRESS=$(solana-keygen pubkey ~/.config/solana/id.json 2>/dev/null || echo "Unable to read")
    echo -e "   Address: $WALLET_ADDRESS"
else
    echo -e "${YELLOW}⚠️  Solana wallet not found${NC}"
    echo -e "   Run: solana-keygen new"
fi
echo ""

# Check if validator is running
echo -e "${BLUE}Checking if validator is running...${NC}"
if lsof -Pi :8899 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}✅ Validator is running on port 8899${NC}"
    if solana cluster-version >/dev/null 2>&1; then
        CLUSTER_VERSION=$(solana cluster-version 2>&1)
        echo -e "   Cluster version: $CLUSTER_VERSION"
    fi
else
    echo -e "${YELLOW}⚠️  Validator is not running${NC}"
    echo -e "   To start: solana-test-validator"
fi
echo ""

# Summary
echo -e "${CYAN}=================================${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All required tools are installed!${NC}"
    echo ""
    echo -e "${CYAN}🚀 You're ready to start development!${NC}"
    echo ""
    echo -e "Run: ${BLUE}npm start${NC} to start the development environment"
else
    echo -e "${RED}❌ $ERRORS required tool(s) missing${NC}"
    echo ""
    echo -e "${YELLOW}Please install missing tools. See SETUP.md for instructions.${NC}"
    exit 1
fi

# PROJECT DEPLOYMENT FLOW

1. Clone the project from GitHub
2. Install dependencies
3. Customize configurations
4. Deploy

# 1. Clone the project from GitHub

Enter the following command in the terminal:

```shell
git clone https://github.com/Karynageek/lottery.git
```

# 2. Install dependencies

Before launch next command open the terminal into the the main folder of project
Then, enter:

```shell
npm install
```

# 3. Customize configurations

In this project:

1. Rename the .env.example file to a file named .env
2. In the .env file change:

a) Set up API key
- if you deploy in Ethereum you should set up your Ethereum API key

To get the Ethereum API key, go to
<a href="https://etherscan.io/">https://etherscan.io/</a>

b) Your wallet and private key of the account which will send the deployment transaction

c) Add Chainlink VRF Configuration

# 4. Deploy

# DEPLOY ON TESTNET

```shell
npx hardhat run scripts/deploy-lottery.ts --network sepolia
```

# DEPLOY ON MAINNET

```shell
npx hardhat run scripts/deploy-lottery.ts --network mainnet
```

# VERIFICATION

Verification is automated
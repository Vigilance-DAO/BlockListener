const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { ETHEREUM_RPC_URL } = require("./constants");

const provider = new ethers.providers.JsonRpcProvider(ETHEREUM_RPC_URL);
const retryDelay = 10000;

async function storeData(txHash, from, to, blockNumber, timeStamp) {
  if (to == null || from == null || txHash == null || blockNumber == null || timeStamp == null) return;

  await prisma.Transactions.create({
    data: {
      transactionHash: txHash,
      blockNumber,
      timeStamp,
      from,
      to,
    },
  });
}

async function fetchDataWithRetry(tx, timeStamp) {
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      const receipt = await provider.getTransactionReceipt(tx);
      if (receipt == null) return;

      await storeData(tx, receipt.from, receipt.to, receipt.blockNumber, timeStamp);
      break;
    } catch (error) {
      console.error(error);
      retries++;
      await delay(retryDelay);
    }
  }
}

async function listenForNewBlock() {
  provider.on("block", async (blockNumber) => {
    let block;
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        block = await provider.getBlock(blockNumber);
        break;
      } catch (error) {
        console.error(error);
        retries++;
        await delay(retryDelay);
      }
    }

    if (block) {
      for (const tx of block.transactions) {
        await fetchDataWithRetry(tx, block.timestamp);
      }
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

listenForNewBlock();
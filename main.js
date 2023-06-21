const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const express = require("express");
const app = express();
const prisma = new PrismaClient();
const { ETHEREUM_RPC_URL } = require("./constants");

const provider = new ethers.providers.JsonRpcProvider(ETHEREUM_RPC_URL);
const retryDelay = 10000;

const date = new Date();
date.setDate(date.getDate() - 89);

const endTime = Math.floor(date.getTime() / 1000);
console.log(endTime);

async function storeData(to, from, timestamp) {
  if (to == null || from == null || timestamp == null) return;

  var address = await prisma.ContractAddresses.findUnique({
    where: { address: to.toLowerCase() },
  });

  if (address == null) {
    address = await prisma.ContractAddresses.create({
      data: { address: to.toLowerCase() },
    });
  }

  await prisma.InteractedAddresses.create({
    data: {
      address: from.toLowerCase(),
      timestamp: timestamp,
      ContractAddresses: {
        connect: {
          id: address.id,
        },
      },
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

      await storeData(receipt.to, receipt.from, timeStamp);
      break;
    } catch (error) {
      console.error(error);
      retries++;
      await delay(retryDelay);
    }
  }
}

async function listenForNewBlock() {
  console.log("new block");
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

async function main() {
  // const latestBlock = await provider.getBlockNumber();
  const latestBlock = 16922046

  for (var i = latestBlock; i > 0; i--) {
    let block;
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        block = await provider.getBlock(i);
        break;
      } catch (error) {
        console.error(error);
        retries++;
        await delay(retryDelay);
      }
    }

    if (!block) continue;

    if (block.timestamp < endTime) {
      return listenForNewBlock();
    }

    for (const tx of block.transactions) {
      await fetchDataWithRetry(tx, block.timestamp);
    }
  }
  return listenForNewBlock();
}

main();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.get("/address/:address", async (req, res) => {
  const address = req.params.address;

  const addressData = await prisma.ContractAddresses.findUnique({
    where: { address: address.toLowerCase() },
    include: { InteractedAddresses: true },
  });

  res.send(addressData);
});

app.listen(3000, () => {
  console.log("server started");
});

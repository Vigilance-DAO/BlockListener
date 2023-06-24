const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { ETHEREUM_RPC_URL, POLYGON_RPC_URL } = require("./constants");
//console.log(ETHEREUM_RPC_URL)
const retryDelay = 10000;

async function storeData(txHash, from, to, blockNumber, timeStamp) {
  if (to == null || from == null || txHash == null || blockNumber == null || timeStamp == null) return;

  //console.log(await prisma.Transactions.create({
  return {
      transactionHash: txHash,
      blockNumber,
      timeStamp,
      from,
      to,
    }
  //}));
}

async function fetchDataWithRetry(tx, timeStamp, provider) {
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      const receipt = await provider.getTransactionReceipt(tx);
      // return receipt;
      if (receipt == null) return;

      return await storeData(tx, receipt.from, receipt.to, receipt.blockNumber, timeStamp);
      break;
    } catch (error) {
      console.error(error);
      retries++;
      await delay(retryDelay);
    }
  }
}

async function listenForNewBlock(url, network) {
  const provider = new ethers.providers.JsonRpcProvider(url);

  provider.on("error", (tx) => {
    // Emitted when any error occurs
    console.log('error', tx)
  });
  provider.on("block", async (blockNumber) => {
    try {
    let block;
    let retries = 0;
    const maxRetries = 3;
    console.log('block', blockNumber)
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
      let data = []
      let promises = []
      console.log('totalTx:', block.transactions.length)
      for (const tx of block.transactions) {
        promises.push(fetchDataWithRetry(tx, block.timestamp, provider));
      }
      let _data = await Promise.all(promises);
      _data.map(item => {
	      if (item) data.push({...item, network});
      })
      console.log('processed tx:', data.length, blockNumber)
      console.log(await prisma.Transactions.createMany({data}));
    }
    } catch(err) {
       console.log('error processing block', err, blockNumber)
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

listenForNewBlock(ETHEREUM_RPC_URL, "ETHEREUM_MAINNET").catch(err => console.error(err));
listenForNewBlock(POLYGON_RPC_URL, "POLYGON_MAINNET").catch(err => console.error(err));

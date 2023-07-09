const { sendMessage } = require("./telegramBot");

const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { ETHEREUM_RPC_URL, POLYGON_RPC_URL, ETHEREUM_RPC_URL2, POLYGON_RPC_URL2 } = require("./constants");

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

async function fetchDataWithRetry(tx, timeStamp, url) {
  const provider = new ethers.providers.JsonRpcProvider(url);
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      const receipt = await provider.getTransactionReceipt(tx);
      // return receipt;
      if (receipt == null) return;

      return await storeData(tx, receipt.from, receipt.to, receipt.blockNumber, timeStamp);
    } catch (error) {
      console.error('Error Fetching Tx', error);
      retries++;
      await delay(retryDelay * (retries));
    }
  }
  sendMessage(`Error Fetching Tx:\n${new Date()}\nRPC: ${url}\nTx: ${tx}\ntime: ${timeStamp}`)
}

let blockBacklogCount = {};
let skippedBlocks = {};
let paused = {};
async function listenForNewBlock(urls, network) {
  const provider = new ethers.providers.JsonRpcProvider(urls[0]);
  blockBacklogCount[network] = 0;
  skippedBlocks[network] = 0;
  paused[network] = false;

  provider.on("error", (tx) => {
    // Emitted when any error occurs
    console.log('error', tx)
  });
  provider.on("block", async (blockNumber) => {
    blockBacklogCount[network]++;
    try {
      let block;
      let retries = 0;
      const maxRetries = 3;
      console.log(`${network} block`, blockNumber)
      console.log(`${network} backlog`, blockBacklogCount[network])
      console.log(`${network} paused`, paused[network])
      console.log(`${network} skipped`, skippedBlocks[network])
      if (blockBacklogCount[network] > 50 || (paused[network] && blockBacklogCount[network] > 3)) {
        paused[network] = true;
        console.log(`${network} backlog too high, skipping block`, blockNumber)
        blockBacklogCount[network]--;
        if (skippedBlocks[network] == 0) {
          sendMessage(`Backlog too high:\n${new Date()}\nNetwork: ${network}\nBlock: ${blockNumber}\nBacklog: ${blockBacklogCount[network]}`)
        }
        skippedBlocks[network]++;
        return;
      }
      if (skippedBlocks[network] > 0) {
        sendMessage(`Backlog cleared:\n${new Date()}\nNetwork: ${network}\nBlock: ${blockNumber}\nBacklog: ${blockBacklogCount[network]}\nSkipped: ${skippedBlocks[network]}`)
        skippedBlocks[network] = 0;
        paused[network] = false;
      }
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
        console.log(`${network} totalTx:`, block.transactions.length)
        let count = 0;
        for (const tx of block.transactions) {
          let url = urls[count % 4 == 0 ? 0 : 1];
          count++;
          promises.push(fetchDataWithRetry(tx, block.timestamp, url));
        }
        let _data = await Promise.all(promises);
        _data.map(item => {
          if (item) data.push({...item, network});
        })
        console.log(`${network} processed tx:`, data.length, blockNumber)
        console.log(network, await prisma.Transactions.createMany({data}));
        blockBacklogCount[network]--;
      }
    } catch(err) {
       console.log('error processing block', err, blockNumber)
       sendMessage(`Error Processing Block:\n${new Date()}\nNetwork: ${network}\nBlock: ${blockNumber}`)
        blockBacklogCount[network]--;
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startBlockTxListener() {
  listenForNewBlock([ETHEREUM_RPC_URL, ETHEREUM_RPC_URL2], "ETHEREUM_MAINNET").catch(err => console.error(err));
  listenForNewBlock([POLYGON_RPC_URL, POLYGON_RPC_URL2], "POLYGON_MAINNET").catch(err => console.error(err));
}

module.exports = {
  startBlockTxListener,
  listenForNewBlock
}

if (require.main === module) {
  startBlockTxListener();
}

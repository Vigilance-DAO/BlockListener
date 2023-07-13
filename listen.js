const { sendMessage } = require("./telegramBot");

const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { ETHEREUM_RPC_URL, POLYGON_RPC_URL, ETHEREUM_RPC_URL2, POLYGON_RPC_URL2 , POLYGON_RPC_URL3 } = require("./constants");

const retryDelay = 10000;

class DataSave {
  data = [];
  savedCount = 0;
  iters = 0;
  network = null;
  constructor(network) {
    this.network = network;
  }
  async start() {
    await this.saveData();
    await new Promise((resolve) => setTimeout(resolve, 10000));
    this.start();
  }

  addItem(item) {
    this.data.push(item);
  }

  logCounter() {
    console.log(new Date(), `${this.network} Saved Count`, this.savedCount);
    this.savedCount = 0;
    if (this.iters < 20) {
      this.iters++;
      setTimeout(() => this.logCounter(), 10000);
    } else {
      this.iters++;
      setTimeout(() => this.logCounter(), 60000 * 10);
    }
  }

  async saveData() {
    try {
      let _data = [...this.data];
      this.data = [];
      if (_data.length > 0) {
        let saved = await prisma.Transactions.createMany({
          data: _data,
          skipDuplicates: true
        });
        this.savedCount += saved.count;
      }
    } catch (err) {
      console.error('Error Saving Data', err);
      sendMessage(`Error Saving Data:\n${new Date()}\n${err}`)
    }
  }
}

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
    } catch (error) {
      console.error('Error Fetching Tx', error);
      retries++;
      await delay(retryDelay * (retries));
    }
  }
  sendMessage(`Error Fetching Tx:\n${new Date()}\nRPC: ${_provider.connection?.url}\nTx: ${tx}\ntime: ${timeStamp}`)
}

let blockBacklogCount = {};
let skippedBlocks = {};
let paused = {};
async function listenForNewBlock(urls, network) {
  const provider = new ethers.providers.JsonRpcProvider(urls[0]);
  const providers = urls.map(url => new ethers.providers.JsonRpcProvider(url));
  blockBacklogCount[network] = 0;
  skippedBlocks[network] = 0;
  paused[network] = false;
  let dataHandler = new DataSave(network);
  dataHandler.start();
  dataHandler.logCounter();

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
      // console.log(`${network} block`, blockNumber)
      // console.log(`${network} backlog`, blockBacklogCount[network])
      // console.log(`${network} paused`, paused[network])
      // console.log(`${network} skipped`, skippedBlocks[network])
      if (blockBacklogCount[network] > 50 || (paused[network] && blockBacklogCount[network] > 3)) {
        paused[network] = true;
        // console.log(`${network} backlog too high, skipping block`, blockNumber)
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
        // console.log(`${network} totalTx:`, block.transactions.length)
        let count = 0;
        for (const tx of block.transactions) {
          let _provider = providers[count % providers.length];
          count++;
          promises.push(fetchDataWithRetry(tx, block.timestamp, _provider));
        }
        let _data = await Promise.all(promises);
        _data.map(item => {
          if (item) dataHandler.addItem({...item, network});
        })
        // console.log(`${network} processed tx:`, data.length, blockNumber)
        // console.log(network, await prisma.Transactions.createMany({data}));
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
  listenForNewBlock([POLYGON_RPC_URL, POLYGON_RPC_URL2, POLYGON_RPC_URL3], "POLYGON_MAINNET").catch(err => console.error(err));
}

module.exports = {
  startBlockTxListener,
  listenForNewBlock
}

if (require.main === module) {
  startBlockTxListener();
}

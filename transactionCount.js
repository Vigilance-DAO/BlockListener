const ethers = require("ethers");
const { PrismaClient } = require("@prisma/client");
const { sendMessage } = require("./telegramBot");
const prisma = new PrismaClient();

const timePeriod = 60 * 60 * 12; //12 hours

function transactionCount(network, fromTimeSec, retry = 0) {
  return new Promise(async (resolve, reject) => {
    const toTimeSec = fromTimeSec + timePeriod;
    const currTime = Math.floor(new Date().getTime() / 1000);
    try {
      if (toTimeSec > currTime) {
        console.log(`\nWaiting for new transactions: To time: ${new Date(toTimeSec * 1000)} Current time: ${new Date(currTime * 1000)}`);
        resolve(fromTimeSec);
        return;
      }
      console.log(`\nAnalysing counts: from ${new Date(fromTimeSec * 1000)} to ${new Date(toTimeSec * 1000)}`)
      console.log(`Network: ${network}`)
      console.log(`current time: ${new Date()}`);

      const allTransactions = await prisma.Transactions.findMany({
        where: {
          timeStamp: {
            gte: fromTimeSec,
            lt: toTimeSec,
          },
          network: network,
        },
      });

      console.log(`${network} Number of transactions: `, allTransactions.length, new Date());
      let counts = {};
      for (let i = 0; i < allTransactions.length; i++) {
        const to = allTransactions[i].to;
        const key = `${to}`;
        if (counts[key]) {
          counts[key] += 1;
        } else {
          counts[key] = 1;
        }
      }

      let data = [];
      for (let key in counts) {
        data.push({
          to: key,
          count: counts[key],
          network: network,
          time: toTimeSec,
        });
      }

      console.log(`${network} Number of combinations: ${data.length}`, new Date());
      if (data.length > 0) {
        console.log(await prisma.TransactionCount.createMany({
          data: data,
        }))
      }
      console.log(`${network} Process completed: ${new Date()}`);
      if (toTimeSec < currTime) {
        resolve(await transactionCount(network, toTimeSec));
        return 
      }
    } catch (error) {
      console.log(`Error: ${new Date()} ${network} ${fromTimeSec} ${toTimeSec} ${retry}`)
      console.log(error);
      if (retry < 3) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        resolve(await transactionCount(network, fromTimeSec, retry + 1));
        return;
      } else {
        sendMessage(`Error in transaction count:\n${new Date()}\nNetwork: ${network}\nFrom: ${fromTimeSec}\nTo: ${toTimeSec}\nRetry: ${retry}\nError: ${error}`)
        await new Promise((resolve) => setTimeout(resolve, 10 * 60000)); // 10 minutes
        resolve();
        return;
      }
    }
    resolve(toTimeSec);
  });
}

async function getLatestTime(network) {
  const latestTime = await prisma.TransactionCount.findFirst({
    where: {
      network: network,
    },
    orderBy: {
      time: "desc",
    },
  });

  if (latestTime) {
    console.log('Latest time: ', latestTime.time)
    return latestTime.time;
  } else {
    let t = await getFirstTransactionTime(network);
    if (t == 0) {
      throw new Error("No transactions found")
    }
    return t;
  }
}

async function getFirstTransactionTime(network) {
  console.log('Getting first transaction time')
  const firstTransactionTime = await prisma.Transactions.findFirst({
    where: {
      network: network,
    },
    orderBy: {
      timeStamp: "asc",
    },
  });

  if (firstTransactionTime) {
    console.log('First transaction time: ', firstTransactionTime.timeStamp)
    return firstTransactionTime.timeStamp;
  } else {
    console.log('No transactions found')
    return 0;
  }
}

async function startTxBatchingJob() {
  try {
    console.log('\n\nRunning transaction count', new Date());
    let startTimeEth = await getLatestTime("ETHEREUM_MAINNET");
    let startTimePolygon = await getLatestTime("POLYGON_MAINNET");
    
    await transactionCount("ETHEREUM_MAINNET", startTimeEth);
    await transactionCount("POLYGON_MAINNET", startTimePolygon);
  } catch (error) {
    console.log('startTxBatchingJob', error);
    sendMessage(`Error in transaction count [main]:\n${new Date()}\nError: ${error}`)
    await new Promise((resolve) => setTimeout(resolve, 10 * 60000)); // 10 minutes
  }

  // try {
  //   // delete transactions older than 30 days
  //   const date = new Date();
  //   date.setDate(date.getDate() - 30);
  //   const endTime = Math.floor(date.getTime() / 1000);
  //   console.log('Deleting transactions older than: ', new Date(endTime * 1000));
  //   console.log(await prisma.Transactions.deleteMany({
  //     where: {
  //       timeStamp: {
  //         lt: endTime,
  //       },
  //     },
  //   }));
  // } catch(error) {
  //   console.log('startTxBatchingJob: delete old tx', error);
  //   sendMessage(`Error in transaction count [old delete]:\n${new Date()}\nError: ${error}`)
  // }

  let waitTimeMs = 1000 * (timePeriod / 4);
  console.log(`\n\nWaiting for ${waitTimeMs / 1000} seconds`, new Date());
  setTimeout(() => {
    startTxBatchingJob();
  }, waitTimeMs);
}

module.exports = {
  startTxBatchingJob
}

if (require.main === module) {
  startTxBatchingJob().catch((error) => {
    console.log('startTxBatchingJob', error);
  });
}

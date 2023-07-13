const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const EthDater = require("ethereum-block-by-date");
require("dotenv").config();
const prisma = new PrismaClient();
const { top10Token_POLYGON } = require("./constant");
const winston = require('winston');
var fs = require('fs');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

const top100Contracts = [];

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;

let abi = ["function balanceOf(address account)"];
let iface = new ethers.utils.Interface(abi);

const retryDelay = 10000;

function changetokenValue(name, startingBalance, endingBalance, obj) {
  var netChange;
  if (obj[name] == undefined) {
    if (startingBalance != 0) {
      netChange = ((endingBalance - startingBalance) / startingBalance) * 100;
    } else {
      netChange = 0;
    }

    obj[name] = {
      initialValue: startingBalance,
      diffvalue: endingBalance - startingBalance,
      netChange: netChange,
    };
  } else {
    const initialValue = obj[name]["initialValue"] + startingBalance;
    const diffvalue = obj[name]["diffvalue"] + endingBalance - startingBalance;

    if (initialValue != 0) {
      netChange = (diffvalue / initialValue) * 100;
    } else {
      netChange = 0;
    }

    obj[name] = {
      initialValue: initialValue,
      diffvalue: diffvalue,
      netChange: netChange,
    };
  }
  return obj;
}

function getBlockTimeSeconds(network) {
  if (network == 'POLYGON_MAINNET') {
    return 2;
  } else if (network == 'ETHEREUM_MAINNET') {
    return 15;
  } else {
    throw new Error('Invalid network');
  }
}

async function drainedAccounts(network, url, top10Token) {
  const currTime = 1688803871;
  const time2DaysAgo = 1688631070;
  var count = 0;

  const provider = new ethers.providers.JsonRpcProvider(url);
  const dater = new EthDater(provider);

  const transactions = await prisma.Transactions.findMany({
    where: {
      // to: {
      //   in: top100Contracts.map((contract) => contract.address),
      // },
      network: network,
      timeStamp: {
        gte: time2DaysAgo,
        lte: currTime,
      },
    },
  });
  console.log(transactions.length);
  const tokenUpdate = [];

  let intervalFile = setInterval(() => {
    fs.writeFile('drain-analysis.json', JSON.stringify(top100Contracts), 'utf8', (callback) => {
      console.log('file updated', callback)
    });
  }, 30000);

  let allPromises = [];
  let completed = 0;
  let _completed = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0};
  let pendingPromises = 0;
  for (let i = 0; i< transactions.length; i++) {
    let transaction = transactions[i];
    async function analyse(transaction) {
      const { from, to, timeStamp, blockNumber } = transaction;
      const startBlock = parseInt(blockNumber) - 1;
      count++;
      console.log(count);
      let myI = count;
      let index = top100Contracts.findIndex(
        (contract) => contract.address == to
      );

      if (index == -1) {
        // completed++;
        // _completed["1"]++;
        // _completed["2"]++;
        // _completed["3"]++;
        // _completed["4"]++;
        // _completed["5"]++;
        // return;
        top100Contracts.push({
          address: to,
          tokenValue: {},
          interactedAddresses: [],
        });
        index = top100Contracts.length - 1;
      }

      if (!top100Contracts[index].interactedAddresses.includes(from)) {
        if (top100Contracts[index].interactedAddresses.length == 100) {
          completed++;
          _completed["1"]++;
          _completed["2"]++;
          _completed["3"]++;
          _completed["4"]++;
          _completed["5"]++;
          return;
        }
        top100Contracts[index].interactedAddresses.push(from);
      } else {
        completed++;
        _completed["1"]++;
        _completed["2"]++;
        _completed["3"]++;
        _completed["4"]++;
        _completed["5"]++;
        return;
      }

      let obj = top100Contracts[index].tokenValue;

      let _retries = 0;
      const maxRetries = 3;
      let endBlock;

      while (_retries < maxRetries) {
        try {
          _completed["4"]++;
          // endBlock = (await dater.getDate((timeStamp + 10 * 60) * 1000)).block;
          endBlock = startBlock + (10 * 60 / getBlockTimeSeconds(network))
          _completed["1"]++; 
          const [startingBalance, endingBalance] = await Promise.all([
            provider.getBalance(from, startBlock),
            provider.getBalance(from, parseInt(endBlock)),
          ]);
          _completed["2"]++;
          const startingBalanceInt = parseInt(startingBalance._hex);
          const endingBalanceInt = parseInt(endingBalance._hex);
          _completed["3"]++;

          obj = changetokenValue(
            "ETH",
            startingBalanceInt,
            endingBalanceInt,
            obj
          );
          if (obj["ETH"]["netChange"] < -1) {
            logger.info(`-- Negative netChange: ${to} - ETH ${JSON.stringify(obj["ETH"])}`);
          }
          break;
        } catch (err) {
          _retries++;
          if (_retries >= maxRetries) {
            console.log(err);
          } else {
            await delay(retryDelay);
          }
        }
      }
      _completed["5"]++;


      const callData = iface.encodeFunctionData("balanceOf", [from]);

      const tokenPromises = top10Token.map(async (token) => {
        let retries = 0;
        while (retries < maxRetries) {
          try {
            const [startingBalance, endingBalance] = await Promise.all([
              provider.call({
                to: token.address,
                data: callData,
                blockTag: startBlock,
              }),
              provider.call({
                to: token.address,
                data: callData,
                blockTag: parseInt(endBlock),
              }),
            ]);

            const startingBalanceInt = parseInt(
              ethers.BigNumber.from(startingBalance)
            );
            const endingBalanceInt = parseInt(
              ethers.BigNumber.from(endingBalance)
            );

            obj = changetokenValue(
              token.name,
              startingBalanceInt,
              endingBalanceInt,
              obj
            );
            if (obj[token.name]["netChange"] < -1) {
              logger.info(`-- Negative netChange: ${to} - ${token.name} ${JSON.stringify(obj[token.name])}`);
            }
            break;
          } catch (err) {
            retries++;
            if (retries >= maxRetries) {
              console.log(err);
            } else {
              await delay(retryDelay);
            }
          }
        }
      });

      await Promise.all(tokenPromises);

      const _tokenValue = JSON.stringify(obj);
      console.log(
        top100Contracts[index].address + "  " + from + "\n" + _tokenValue + "\n"
      );

      tokenUpdate.push({
        to,
        tokenValue: obj,
      });
      console.log('myI', myI);
      completed++;
      console.log('completed', completed);
    }

    async function analyseWrapper(transaction) {
      try {
        pendingPromises++;
        await analyse(transaction);
        logger.info("contracts length: " + top100Contracts.length);
        pendingPromises--;
      } catch (err) {
        console.log('analyseWrapper', err);
        pendingPromises--;
      }
    }
    while (true) {
      console.log('checking next run', completed, count, transactions.length, pendingPromises);
      if ((count - completed) < 100) {
        // await new Promise((resolve) => setTimeout(resolve, 100));
        allPromises.push(analyseWrapper(transaction));
        break;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  };

  const interval = setInterval(() => {
    console.log(new Date(), 'completed', completed, _completed, 'count', count, 'pendingPromises', pendingPromises);
  }, 1000);

  console.log('all tx initiated')

  await Promise.all(allPromises);
  console.log('all tx completed')
  clearInterval(interval);

  tokenUpdate.forEach(async (update) => {
    const index = top100Contracts.findIndex(
      (contract) => contract.address == update.to
    );
    top100Contracts[index].tokenValue = update.tokenValue;
  });

  console.log(JSON.stringify(top100Contracts));
  for(let i=0; i<top100Contracts.length; i++) {
    const contract = top100Contracts[i];
    Object.keys(contract.tokenValue).forEach(async (key) => {
      if (contract.tokenValue[key].netChange < 0) {
        console.log(contract.address, key, contract.tokenValue[key]);
        logger.info(`>> Negative netChange: ${contract.address} - ${key} ${JSON.stringify(contract.tokenValue[key])}`);
      }
    });
  }
  clearInterval(intervalFile);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

drainedAccounts("POLYGON_MAINNET", POLYGON_RPC_URL, top10Token_POLYGON);

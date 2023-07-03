const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const EthDater = require("ethereum-block-by-date");
const express = require("express");
const app = express();
const prisma = new PrismaClient();
const { top10Token_ETHEREUM, top10Token_POLYGON } = require("./constant");

const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL;
const ETHEREUM_provider = new ethers.providers.JsonRpcProvider(
  ETHEREUM_RPC_URL
);
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;
const POLYGON_provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC_URL);

var id = -1;
const retryDelay = 10000;

let abi = ["function balanceOf(address account)"];
let iface = new ethers.utils.Interface(abi);

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

async function drainedAccounts(network, provider, top10Token) {
  const batchSize = 100;
  const transactions = await prisma.Transactions.findMany({
    where: {
      id: { gt: id },
      network: network,
    },
    orderBy: {
      id: "asc",
    },
    take: batchSize,
  });

  const tokenUpdate = [];

  for (const transaction of transactions) {
    id = transaction.id;
    const { from, to, timeStamp, blockNumber } = transaction;
    const startBlock = parseInt(blockNumber) - 1;

    let contract = await prisma.ContractAddresses.findFirst({
      where: {
        address: {
          equals: to,
          mode: "insensitive",
        },
        network: network,
      },
    });

    if (contract == null) {
      contract = await prisma.ContractAddresses.create({
        data: {
          address: to,
          network: network,
        },
      });
    }

    let obj = JSON.parse(contract.tokenValue);

    let retries = 0;
    const maxRetries = 3;
    let endBlock;
    const dater = new EthDater(provider);

    while (retries < maxRetries) {
      try {
        endBlock = (await dater.getDate((timeStamp + 10 * 60) * 1000)).block;

        const [startingBalance, endingBalance] = await Promise.all([
          provider.getBalance(from, startBlock),
          provider.getBalance(from, parseInt(endBlock)),
        ]);

        const startingBalanceInt = parseInt(startingBalance._hex);
        const endingBalanceInt = parseInt(endingBalance._hex);

        obj = changetokenValue(
          "ETH",
          startingBalanceInt,
          endingBalanceInt,
          obj
        );
        break;
      } catch (err) {
        console.log(err);
        retries++;
        await delay(retryDelay);
      }
    }

    const callData = iface.encodeFunctionData("balanceOf", [from]);

    const tokenPromises = top10Token.map(async (token) => {
      retries = 0;
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
          break;
        } catch (err) {
          console.log(err);
          retries++;
          await delay(retryDelay);
        }
      }
    });

    await Promise.all(tokenPromises);

    const tokenValue = JSON.stringify(obj);
    console.log(id);
    console.log(tokenValue + "\n");

    tokenUpdate.push({
      to,
      tokenValue,
    });
  }

  tokenUpdate.forEach(async (update) => {
    try {
      await prisma.ContractAddresses.updateMany({
        where: {
          address: {
            equals: update.to,
            mode: "insensitive",
          },
          network: network,
        },
        data: {
          tokenValue: update.tokenValue,
        },
      });
    } catch (error) {
      console.log(error);
    }
  });

  setTimeout(drainedAccounts, 1 * 60 * 1000);
}

drainedAccounts("ETHEREUM_MAINNET", ETHEREUM_provider, top10Token_ETHEREUM);
// drainedAccounts("POLYGON_MAINNET", POLYGON_provider, top10Token_POLYGON);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

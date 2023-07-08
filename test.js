const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const EthDater = require("ethereum-block-by-date");
require("dotenv").config();
const prisma = new PrismaClient();
const { top10Token_POLYGON } = require("./constant");

const top100Contracts = [
  {
    address: "0xb54D6F958C3940db47ccfD65125a2A31D9FCb756",
    tokenValue: "{}",
    interactedAddresses: [],
  },
  {
    address: "0x1278C74c3B2f8c3BcA0089b4E128fAf023615ECf",
    tokenValue: "{}",
    interactedAddresses: [],
  },
  {
    address: "0xCd16dF514a501596a8E24fE1dC9c9be9c9091285",
    tokenValue: "{}",
    interactedAddresses: [],
  },
  {
    address: "0xb6c02600D9956EDd226E87bB6F82cEa1ead8822F",
    tokenValue: "{}",
    interactedAddresses: [],
  },
  {
    address: "0x704179beB09282EaEf98CA8aaa443C1E273eBBc2",
    tokenValue: "{}",
    interactedAddresses: [],
  },
  {
    address: "0x0faf504bee22AF6E92D6697Af2EAfB9941a1712D",
    tokenValue: "{}",
    interactedAddresses: [],
  },
  {
    address: "0xD4957F86CC075D769a77832d5ec3A375E247c45c",
    tokenValue: "{}",
    interactedAddresses: [],
  },
  {
    address: "0xe2d792d64A36797f8d3E0F150B82d1E35Da76136",
    tokenValue: "{}",
    interactedAddresses: [],
  },
  {
    address: "0xC3f16f2a1C4469F931148e88622A45bF60804b68",
    tokenValue: "{}",
    interactedAddresses: [],
  },
  {
    address: "0xB2e3EEd25825E8c3946e403B8E8D943976E484E4",
    tokenValue: "{}",
    interactedAddresses: [],
  },
];

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

async function drainedAccounts(network, url, top10Token) {
  const currTime = 1688803871;
  const time2DaysAgo = 1688631070;
  var count = 0;

  const provider = new ethers.providers.JsonRpcProvider(url);
  const dater = new EthDater(provider);

  const transactions = await prisma.Transactions.findMany({
    where: {
      to: {
        in: top100Contracts.map((contract) => contract.address),
      },
      network: network,
      timeStamp: {
        gte: time2DaysAgo,
        lte: currTime,
      },
    },
  });
  console.log(transactions.length);
  const tokenUpdate = [];

  for (const transaction of transactions) {
    const { from, to, timeStamp, blockNumber } = transaction;
    const startBlock = parseInt(blockNumber) - 1;
    count++;
    console.log(count);
    const index = top100Contracts.findIndex(
      (contract) => contract.address == to
    );

    if (index == -1) {
      continue;
    }

    if (!top100Contracts[index].interactedAddresses.includes(from)) {
      if (top100Contracts[index].interactedAddresses.length == 100) {
        continue;
      }
      top100Contracts[index].interactedAddresses.push(from);
    }

    let obj = JSON.parse(top100Contracts[index].tokenValue);

    let retries = 0;
    const maxRetries = 3;
    let endBlock;

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
    console.log(
      top100Contracts[index].address + "  " + from + "\n" + tokenValue + "\n"
    );

    tokenUpdate.push({
      to,
      tokenValue,
    });
  }

  tokenUpdate.forEach(async (update) => {
    const index = top100Contracts.findIndex(
      (contract) => contract.address == update.to
    );
    top100Contracts[index].tokenValue = update.tokenValue;
  });

  console.log(top100Contracts);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

drainedAccounts("POLYGON_MAINNET", POLYGON_RPC_URL, top10Token_POLYGON);

const express = require("express");
const ethers = require("ethers");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { ETHERSCAN_API_KEY, ETHEREUM_RPC_URL } = require("./constants");

const app = express();

const provider = new ethers.providers.JsonRpcProvider(ETHEREUM_RPC_URL);

async function getCreationDate(address) {
  var contract = await prisma.ContractAddresses.findUnique({
    where: {
      address: address,
    },
  });

  if (contract == null) {
    contract = await prisma.ContractAddresses.create({
      data: {
        address: address,
      },
    });
  }

  var date = contract.creationDate;
  if (date == "NA") {
    const response = await fetch(
      `https://api.etherscan.io/api?module=contract&action=getcontractcreation&contractaddresses=${address}&apikey=${ETHERSCAN_API_KEY}`
    );

    const data = await response.json();

    if (data.result == null) {
      return "NA";
    }

    const txHash = data.result[0].txHash;
    const tx = await provider.getTransaction(txHash);
    const block = await provider.getBlock(tx.blockHash);
    date = new Date(block.timestamp * 1000);
    date = date.toISOString().slice(0, 10);

    await prisma.ContractAddresses.update({
      where: {
        address: address,
      },
      data: {
        creationDate: date,
      },
    });
  }

  return date;
}

app.get("/address/:address", async (req, res) => {
  const address = req.params.address;

  const now = new Date();

  var yesterday = new Date(now.setDate(now.getDate() - 1)).getTime() / 1000;
  var lastMonth = new Date(now.setDate(now.getDate() - 30)).getTime() / 1000;

  yesterday = Math.floor(yesterday);
  lastMonth = Math.floor(lastMonth);

  const transactionsLast24Hours = await prisma.Transactions.findMany({
    where: {
      to: {
        equals: address,
        mode: "insensitive",
      },
      timeStamp: {
        gte: yesterday,
      },
    },
    distinct: ["from"],
  });

  const transactionsLast30Days = await prisma.Transactions.findMany({
    where: {
      to: {
        equals: address,
        mode: "insensitive",
      },
      timeStamp: {
        gte: lastMonth,
      },
    },
    distinct: ["from"],
  });

  const date = await getCreationDate(address);

  const userCount24hours = transactionsLast24Hours.length;
  const userCount30days = transactionsLast30Days.length;

  res.json({
    userCount24hours,
    userCount30days,
    creationDate: date,
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

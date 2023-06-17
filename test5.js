const express = require("express");
const { ethers } = require("ethers");
const Moralis = require("moralis").default;
const { EvmChain } = require("@moralisweb3/common-evm-utils");
const EthDater = require("block-by-date-ethers");

const app = express();

var toAddress;
const chain = EvmChain.ETHEREUM;
const MORALIS_API_KEY =
  "OCGCYyI8WZ8w7FIj23gFSMN4aT0KnO2DoJLikWYGEzkWYC8ujhPrlxP8rvfrqk36";

const provider = new ethers.providers.JsonRpcProvider(
  "https://eth-mainnet.g.alchemy.com/v2/4xXf1FH27swhdk6hsQ1qMGqPZRfU59MN"
);

const dater = new EthDater(provider);

const Addresses = [];
const addresses = new Set();

async function getDatafor30days() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  var last30DaysData = [];
  var cursor;

  do {
    const response = await Moralis.EvmApi.transaction.getWalletTransactions({
      address: toAddress,
      chain,
      fromDate: startDate,
      toDate: new Date(),
      cursor: cursor,
    });

    const data = response.toJSON();
    if (data.result.length > 0) {
      last30DaysData = data.result.map((tx) => [
        tx.from_address,
        Math.floor(new Date(tx.block_timestamp).getTime() / 1000),
        tx.block_number,
      ]);
    }
    cursor = data.cursor;
  } while (cursor != null && cursor != undefined);

  last30DaysData.sort((a, b) => a[1] - b[1]);

  const Address = {
    address: toAddress,
    interactedWith: [],
    interactedin24hours: 0,
    interactedin30days: 0,
    drainedAccounts: 0,
  };

  Address.interactedWith = last30DaysData;
  Addresses.push(Address);
  addresses.add(toAddress);

  countFor24hours(Address);
  countFor30days(Address);
  countDrainedAccounts(Address);
}

async function main() {
  await Moralis.start({
    apiKey: MORALIS_API_KEY,
  });
}

async function updateData() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 7);

  const timeStamp = Math.floor(thirtyDaysAgo.getTime() / 1000);

  Addresses.forEach((Address) => {
    Address.interactedWith = Address.interactedWith.filter(
      (tx) => tx[1] >= timeStamp
    );

    countFor30days(Address);
    countDrainedAccounts(Address);
  });
}

provider.on("block", async (blockNumber) => {
  try {
    const block = await provider.getBlock(blockNumber);
    for (const txHash of block.transactions) {
      const receipt = await provider.getTransactionReceipt(txHash);

      if (receipt == null) continue;
      if (addresses.has(receipt.to)) {
        Addresses.forEach((Address) => {
          if (Address.address == receipt.to) {
            Address.interactedWith.push([
              receipt.from,
              block.timestamp,
              block.number,
            ]);
          }
        });
      }
    }
  } catch (error) {
    console.log(error);
  }
});

async function countFor24hours(Address) {
  const previousdate = new Date();
  previousdate.setDate(previousdate.getDate() - 1);

  const timeStamp = Math.floor(previousdate.getTime() / 1000);
  const addresses = new Set();
  Address.interactedWith.forEach((tx) => {
    if (tx[1] >= timeStamp) {
      addresses.add(tx[0]);
    }
  });

  Address.interactedin24hours = addresses.size;
  console.log("24 hours: " + Address.interactedin24hours);
}

async function countFor30days(Address) {
  const addresses = new Set();
  Address.interactedWith.forEach((tx) => {
    addresses.add(tx[0]);
  });

  Address.interactedin30days = addresses.size;
  console.log("30 days: " + Address.interactedin30days);
}

async function countDrainedAccounts(Address) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const timeStamp = Math.floor(startDate.getTime() / 1000);

  var count = 0;

  const balanceCheckPromises = Address.interactedWith.map(async (tx) => {
    if (tx[1] >= timeStamp) {
      const startTime = new Date(tx[1] * 1000);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      const startBlock = tx[2];
      const endblock = (await dater.getDate(endTime)).block;

      const startBalance = await provider.getBalance(
        tx[0],
        parseInt(startBlock)
      );
      const endBalance = await provider.getBalance(tx[0], parseInt(endblock));

      if (endBalance.isZero() && !startBalance.isZero()) {
        count++;
      }
    }
  });
  await Promise.all(balanceCheckPromises);

  Address.drainedAccounts = count;
  console.log("Drained accounts: " + Address.drainedAccounts);
}
main();
setInterval(updateData, 24 * 60 * 60 * 1000);
setInterval(() => {
  Addresses.forEach((Address) => {
    countFor24hours(Address);
  });
}, 60 * 60 * 1000);

app.get("/address/:address", async (req, res) => {
  const address = req.params.address;
  toAddress = address;

  if (!addresses.has(toAddress)) await getDatafor30days();

  const Address = Addresses.find((Address) => Address.address == toAddress);

  const string =
    "24 hours: " +
    Address.interactedin24hours.toString() +
    "," +
    "30 days: " +
    Address.interactedin30days.toString() +
    "," +
    "Drained accounts: " +
    Address.drainedAccounts.toString();
  res.send(string);
});

app.listen(3000, () => {
  console.log("Server is up on port 3000.");
});

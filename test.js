const { ethers } = require("ethers");
const express = require("express");

const app = express();

const provider = new ethers.providers.JsonRpcProvider(
  "https://eth-mainnet.g.alchemy.com/v2/4xXf1FH27swhdk6hsQ1qMGqPZRfU59MN"
);

const PORT = process.env.PORT || 3000;

const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const endTime = Math.floor(thirtyDaysAgo.getTime() / 1000);

const listOfAddresses = new Set();
const Addresses = [];

async function main() {
  const latestBlock = await provider.getBlockNumber();

  for (var i = latestBlock; i > 0; i--) {
    const block = await provider.getBlock(i);

    if (block.timestamp < endTime) {
      break;
    }

    for (const tx of block.transactions) {
      const receipt = await provider.getTransactionReceipt(tx);
      if (receipt == null) continue;

      if (!listOfAddresses.has(receipt.to)) {
        const Address = {
          address: receipt.to,
          interactedWith: [],
          interactedin24hours: 0,
          interactedin30days: 0,
          drainedAccounts: 0,
        };
        Address.interactedWith.push([
          receipt.from,
          block.timestamp,
          block.number,
        ]);
        Addresses.push(Address);
        listOfAddresses.add(receipt.to);
      } else {
        const Address = Addresses.find(
          (address) => address.address == receipt.to
        );
        Address.interactedWith.push([
          receipt.from,
          block.timestamp,
          block.number,
        ]);
      }
    }
  }
  listenForNewBlock();
}

main();

async function listenForNewBlock() {
  provider.on("block", async (blockNumber) => {
    const block = await provider.getBlock(blockNumber);
    console.log(blockNumber);
    for (const tx of block.transactions) {
      const receipt = await provider.getTransactionReceipt(tx);
      if (receipt == null) continue;

      if (!listOfAddresses.has(receipt.to)) {
        const Address = {
          address: receipt.to,
          interactedWith: [],
          interactedin24hours: 0,
          interactedin30days: 0,
          drainedAccounts: 0,
        };
        Address.interactedWith.push([
          receipt.from,
          block.timestamp,
          block.number,
        ]);
        Addresses.push(Address);
        listOfAddresses.add(receipt.to);
      } else {
        const Address = Addresses.find(
          (address) => address.address == receipt.to
        );
        Address.interactedWith.push([
          receipt.from,
          block.timestamp,
          block.number,
        ]);
      }
    }
  });
}

async function startCount(Address) {
  const previousdate = new Date();
  previousdate.setDate(previousdate.getDate() - 1);

  const timeStamp = Math.floor(previousdate.getTime() / 1000);

  const addresses = new Set();
  var count24hours = 0;
  var count30days = 0;

  Address.interactedWith.forEach((tx) => {
    if (!addresses.has(tx[0])) {
      if (tx[1] >= timeStamp) {
        count24hours++;
      }
      count30days++;
      addresses.add(tx[0]);
    }
  });

  Address.interactedin24hours = count24hours;
  Address.interactedin30days = count30days;
}

app.get("/address/:address", (req, res) => {
  const Address = Addresses.find(
    (address) => address.address == req.params.address
  );

  if (Address == undefined) {
    res.send("Address not found");
    return;
  }

  startCount(Address);
  res.send(
    `Address: ${Address.address} <br> Interacted with: ${Address.interactedWith.length} <br> Interacted in 24 hours: ${Address.interactedin24hours} <br> Interacted in 30 days: ${Address.interactedin30days}`
  );
});

app.listen(PORT, () => {
  console.log("server started");
});

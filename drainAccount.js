const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const EthDater = require("ethereum-block-by-date");
const express = require("express");
const app = express();
const prisma = new PrismaClient();
const { ETHEREUM_RPC_URL } = require("./constants");

const provider = new ethers.providers.JsonRpcProvider(ETHEREUM_RPC_URL);

const dater = new EthDater(provider);
var id = -1;

let abi = ["function balanceOf(address account)"];
let iface = new ethers.utils.Interface(abi);

const top10Token = [
  {
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
    name: "DAI",
  },
  {
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    name: "WETH",
  },
  {
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    name: "USDC",
  },
  {
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    name: "USDT",
  },
  {
    address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    name: "WBTC",
  },
  {
    address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    name: "AAVE",
  },
  {
    address: "0x514910771af9ca656af840dff83e8264ecf986ca",
    name: "LINK",
  },
  {
    address: "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e",
    name: "YFI",
  },
  {
    address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    name: "UNI",
  },
  {
    address: "0x57ab1ec28d129707052df4df418d58a2d46d5f51",
    name: "SUSD",
  },
];

async function drainedAccounts() {
  const prismadata = await prisma.InteractedAddresses.findMany({
    where: {
      id: {
        gt: id,
      },
    },
  });

  for (var i = 0; i < prismadata.length; i++) {
    id = prismadata[i].id;
    var address = prismadata[i].address;
    var timestamp = prismadata[i].timestamp;
    var contractAddressId = prismadata[i].contractAddressId;
    var changedValue = "";

    let startBlock = (await dater.getDate(timestamp * 1000, true)).block;
    let endBlock = (await dater.getDate((timestamp + 10 * 60) * 1000)).block;

    try {
      var startingBalance = await provider.getBalance(
        address,
        parseInt(startBlock)
      );
      var endingBalance = await provider.getBalance(
        address,
        parseInt(endBlock)
      );

      startingBalance = startingBalance._hex;
      endingBalance = endingBalance._hex;

      if (startingBalance != 0) {
        const netPercentageChange = (
          ((endingBalance - startingBalance) / startingBalance) *
          100
        ).toFixed(2);

        changedValue += `ETH: ${netPercentageChange}% `;
      }
    } catch (err) {
      console.log(err);
    }

    let callData = iface.encodeFunctionData("balanceOf", [address]);

    for (var j = 0; j < top10Token.length; j++) {
      try {
        var startingBalance = await provider.call({
          to: top10Token[j].address,
          data: callData,
          blockTag: parseInt(startBlock),
        });

        var endingBalance = await provider.call({
          to: top10Token[j].address,
          data: callData,
          blockTag: parseInt(endBlock),
        });

        startingBalance = ethers.BigNumber.from(startingBalance);
        endingBalance = ethers.BigNumber.from(endingBalance);

        if (startingBalance != 0) {
          const netPercentageChange = (
            ((endingBalance - startingBalance) / startingBalance) *
            100
          ).toFixed(2);

          changedValue += `${top10Token[j].name}: ${netPercentageChange}% `;
        }
      } catch (err) {
        console.log(err);
      }
    }

    if (changedValue != "") {
      await prisma.InteractedAddresses.update({
        where: { id: id },
        data: { changedValue: changedValue },
      });
    }
  }
  setTimeout(drainedAccounts, 30 * 60 * 1000);
}

drainedAccounts();

app.get("/address/:address", async (req, res) => {
  const address = req.params.address;

  const addressData = await prisma.ContractAddresses.findUnique({
    where: { address: address.toLowerCase() },
    include: { InteractedAddresses: true },
  });

  res.send(addressData);
});

app.listen(3000, () => {
  console.log("Server is running on port 3000.");
});

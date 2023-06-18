const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const EthDater = require("ethereum-block-by-date");
const prisma = new PrismaClient();

const provider = new ethers.providers.JsonRpcProvider(
  "https://eth-mainnet.g.alchemy.com/v2/4xXf1FH27swhdk6hsQ1qMGqPZRfU59MN"
);

const dater = new EthDater(provider);
var id = -1;

let abi = ["function balanceOf(address account)"];
let iface = new ethers.utils.Interface(abi);

const top10Token = [
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", // AAVE
  "0x514910771af9ca656af840dff83e8264ecf986ca", // LINK
  "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e", // YFI
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", // UNI
  "0x57ab1ec28d129707052df4df418d58a2d46d5f51", // SUSD
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
    var check = false;

    let startBlock = (await dater.getDate(timestamp * 1000)).block;
    let endBlock = (await dater.getDate((timestamp + 10 * 60) * 1000)).block;

    var startingBalance = await provider.getBalance(
      address,
      parseInt(startBlock)
    );
    var endingBalance = await provider.getBalance(address, parseInt(endBlock));

    console.log(startingBalance.toString(), endingBalance.toString());

    if (endingBalance.isZero() && !startingBalance.isZero()) {
      check = true;
    }

    if (!check) {
      let callData = iface.encodeFunctionData("balanceOf", [address]);

      for (var j = 0; j < top10Token.length; j++) {
        var startingBalance = await provider.call({
          to: top10Token[j],
          data: callData,
          blockTag: parseInt(startBlock),
        });

        var endingBalance = await provider.call({
          to: top10Token[j],
          data: callData,
          blockTag: parseInt(endBlock),
        });

        startingBalance = ethers.BigNumber.from(startingBalance);
        endingBalance = ethers.BigNumber.from(endingBalance);

        log(startingBalance.toString(), endingBalance.toString());

        if (endingBalance.isZero() && !startingBalance.isZero()) {
          check = true;
          break;
        }
      }
    }

    if (check) {
      await prisma.contractAddresses.update({
        where: {
          id: contractAddressId,
        },
        data: {
          drainedAccounts: {
            increment: 1,
          },
        },
      });
    }
  }

  setTimeout(drainedAccounts, 30 * 60 * 1000);
}

drainedAccounts();

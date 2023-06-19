const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { ETHERSCAN_API_KEY, ETHEREUM_RPC_URL } = require("./constants");

const provider = new ethers.providers.JsonRpcProvider(ETHEREUM_RPC_URL);

var id = -1;

async function ContractCreationDate() {
  const prismadata = await prisma.contractAddresses.findMany({
    where: {
      id: {
        gt: id,
      },
    },
  });

  for (let i = 0; i < prismadata.length; i += 5) {
    const response = await fetch(
      `https://api.etherscan.io/api?module=contract&action=getcontractcreation&contractaddresses=${
        prismadata[i].address
      },${prismadata[i + 1].address},${prismadata[i + 2].address},${
        prismadata[i + 3].address
      },${prismadata[i + 4].address}&apikey=${ETHERSCAN_API_KEY}`
    );

    const data = await response.json();

    if (data.result == null) continue;

    for (var j = 0; j < data.result.length; j++) {
      const txHash = data.result[j].txHash;
      const tx = await provider.getTransaction(txHash);
      const block = await provider.getBlock(tx.blockHash);
      var date = new Date(block.timestamp * 1000);
      date = date.toISOString().slice(0, 10);

      await prisma.contractAddresses.update({
        where: {
          address: data.result[j].contractAddress,
        },
        data: {
          creationDate: date,
        },
      });
    }
  }
}

ContractCreationDate();

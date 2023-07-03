const ethers = require("ethers");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const timePeriod = 60 * 60 * 3; //3 hours

async function transactionCount(network) {
  const currTime = Math.floor(new Date().getTime() / 1000);
  const period = currTime - timePeriod;

  const fromAddresses = await prisma.Transactions.findMany({
    where: {
      timeStamp: {
        gte: period,
      },
      network: network,
    },
    distinct: ["from"],
  });

  const toAddresses = await prisma.Transactions.findMany({
    where: {
      timeStamp: {
        gte: period,
      },
      network: network,
    },
    distinct: ["to"],
  });

  for (var i = 0; i < fromAddresses.length; i++) {
    for (var j = 0; j < toAddresses.length; j++) {
      const count = await prisma.Transactions.count({
        where: {
          from: fromAddresses[i].from,
          to: toAddresses[j].to,
          timeStamp: {
            gte: period,
          },
          network: network,
        },
      });

      if (count != 0) {
        const transaction = await prisma.TransactionCount.findFirst({
          where: {
            from: fromAddresses[i].from,
            to: toAddresses[j].to,
            network: network,
          },
        });

        if (transaction) {
          await prisma.TransactionCount.update({
            where: {
              id: transaction.id,
            },
            data: {
              count: {
                increment: count,
              },
              time: currTime,
            },
          });
        } else {
          await prisma.TransactionCount.create({
            data: {
              from: fromAddresses[i].from,
              to: toAddresses[j].to,
              count: count,
              network: network,
              time: currTime,
            },
          });
        }
      }
    }
  }
  setTimeout(transactionCount, timePeriod);
}
transactionCount("ETHEREUM_MAINNET");
// transactionCount("POLYGON_MAINNET");

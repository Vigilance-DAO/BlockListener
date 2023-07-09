const { startBlockTxListener } = require("./listen");
const { startTxBatchingJob } = require("./transactionCount");

startTxBatchingJob();
startBlockTxListener();
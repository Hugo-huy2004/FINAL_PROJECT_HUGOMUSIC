const { createLoadBalancer, readConfig } = require('./src/proxy');
const { runCluster } = require('./src/cluster');
const { bench } = require('./src/bench');
const balancer = require('./src/balancer');

module.exports = { createLoadBalancer, readConfig, runCluster, bench, ...balancer };

const U = require('./_ops-utils');
const { allDealerships, allDealershipNames } = require('./_ops-config');

exports.handler = async (event) => {
  const { response } = U.requireSession(event, ['admin']);
  if (response) return response;
  return U.json(200, { dealerships: allDealershipNames(), brands: allDealerships() });
};

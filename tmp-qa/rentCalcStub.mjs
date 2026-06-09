export const formatUGX = (n) => 'UGX ' + (Number(n)||0).toLocaleString();
export const calculateRequestFee = (rent) => Math.round((Number(rent)||0)*0.1);

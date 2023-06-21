const { ethers } = require("ethers");
const { utils } = require("ffjavascript");
const fs = require("fs");
const snarkjs = require("snarkjs");
const hardhat = require("hardhat");

const BASE_PATH = "./circuits/zkcircuit/";

function p256(n) {
  let nstr = n.toString(16);
  while (nstr.length < 64) nstr = "0" + nstr;
  nstr = "0x" + nstr;
  return ethers.BigNumber.from(nstr);
}

async function generateCallData() {
  const zkProof = await generateProof();
  const proof = utils.unstringifyBigInts(zkProof.proof);
  const pub = utils.unstringifyBigInts(zkProof.publicSignals);

  let inputs = "";
  for (let i = 0; i < pub.length; i++) {
    if (inputs) inputs += ",";
    inputs += p256(pub[i]);
  }

  const pi_a = [p256(proof.pi_a[0]), p256(proof.pi_a[1])];
  const pi_b = [
    [p256(proof.pi_b[0][1]), p256(proof.pi_b[0][0])],
    [p256(proof.pi_b[1][1]), p256(proof.pi_b[1][0])],
  ];
  const pi_c = [p256(proof.pi_c[0]), p256(proof.pi_c[1])];
  const input = [inputs];

  return { pi_a, pi_b, pi_c, input };
}

async function generateProof() {
  const inputData = fs.readFileSync(BASE_PATH + "input.json", "utf8");
  const input = JSON.parse(inputData);

  const out = await snarkjs.wtns.calculate(
    input,
    BASE_PATH + "out/circuit.wasm",
    BASE_PATH + "out/circuit.wtns"
  );

  const proof = await snarkjs.groth16.prove(
    BASE_PATH + "out/circuit.zkey",
    BASE_PATH + "out/circuit.wtns"
  );

  fs.writeFileSync(BASE_PATH + "out/proof.json", JSON.stringify(proof, null, 1));

  return proof;
}

async function main() {
  const Verifier = await hardhat.ethers.getContractFactory(
    "./contracts/Verifier.sol:Verifier"
  );
  const verifier = await Verifier.deploy();
  await verifier.deployed();
  console.log(`Verifier deployed to ${verifier.address}`);

   // export the addresses
   fs.writeFileSync('scripts/contractAddress.js', `
   export const verifierAddress = "${verifier.address}"
 `)

  const { pi_a, pi_b, pi_c, input } = await generateCallData();

  const tx = await verifier.verifyProof(pi_a, pi_b, pi_c, input);
  console.log(`Verifier result: ${tx}`);
  console.assert(tx == true, "Proof verification failed!");

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
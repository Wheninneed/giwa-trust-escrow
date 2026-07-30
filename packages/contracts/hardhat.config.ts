import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import "dotenv/config";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViemPlugin, hardhatVerify],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          // createAgreement 는 명세서가 요구하는 파라미터 수가 많아 스택 한계에
          // 걸린다. 시그니처를 그대로 유지하기 위해 IR 파이프라인을 사용한다.
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          // createAgreement 는 명세서가 요구하는 파라미터 수가 많아 스택 한계에
          // 걸린다. 시그니처를 그대로 유지하기 위해 IR 파이프라인을 사용한다.
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  networks: {
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    giwaSepolia: {
      type: "http",
      chainType: "op",
      url: process.env.GIWA_SEPOLIA_RPC_URL ?? "https://sepolia-rpc.giwa.io",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  chainDescriptors: {
    91342: {
      name: "GIWA Sepolia",
      blockExplorers: {
        blockscout: {
          name: "GIWA Sepolia Explorer",
          url: "https://sepolia-explorer.giwa.io",
          apiUrl: "https://sepolia-explorer.giwa.io/api",
        },
      },
    },
  },
  verify: {
    blockscout: {
      enabled: true,
    },
  },
};

export default config;

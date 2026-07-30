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
    // 테스트넷 ETH 없이 프론트엔드를 돌려보기 위한 로컬 노드.
    // GIWA Sepolia 와 같은 chainId 를 쓰므로 웹 앱은 RPC 주소만 바꾸면 된다.
    //   npx hardhat node --network localGiwa
    //   npx hardhat run scripts/deploy.ts --network localhost
    localGiwa: {
      type: "edr-simulated",
      chainType: "op",
      chainId: 91342,
    },
    localhost: {
      type: "http",
      chainType: "op",
      url: "http://127.0.0.1:8545",
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
    // GIWA(91342)는 Sourcify·Etherscan 어느 쪽에도 등록되어 있지 않다.
    // 검증은 GIWA 공식 Blockscout 익스플로러로만 한다.
    sourcify: {
      enabled: false,
    },
    etherscan: {
      enabled: false,
    },
  },
};

export default config;

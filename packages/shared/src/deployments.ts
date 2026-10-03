import raw from "../deployments.json";

export interface Deployments {
  chainId: number;
  eas: `0x${string}`;
  schemaRegistry: `0x${string}`;
  sbt: `0x${string}`;
  sbtDeployBlock: number;
  schemaClientReview: `0x${string}`;
  schemaInterviewResult: `0x${string}`;
}

export const deployments = raw as Deployments;

const ZERO = /^0x0+$/;
export const isDeployed = (addr: string | undefined): addr is `0x${string}` =>
  !!addr && /^0x[0-9a-fA-F]+$/.test(addr) && !ZERO.test(addr);

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASESCAN = "https://sepolia.basescan.org";
export const EASSCAN = "https://base-sepolia.easscan.org";

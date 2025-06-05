import 'dotenv/config'; // dotenv를 import (최상단)
import fetch from 'node-fetch';
import { Network, Alchemy } from "alchemy-sdk";
import { ethers } from 'ethers';

// ─── 환경 변수에서 API 키 및 RPC URL 세팅 ──────────────────────────────
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
if (!ALCHEMY_API_KEY) {
    throw new Error("ALCHEMY_API_KEY가 .env에 정의되어 있지 않습니다.");
}
const ALCHEMY_RPC_URL = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

// ─── Alchemy SDK 및 ethers Provider 초기화 ─────────────────────────────
const alchemy = new Alchemy({
    apiKey: ALCHEMY_API_KEY,
    network: Network.ETH_SEPOLIA,
});
const ethProvider = new ethers.JsonRpcProvider(ALCHEMY_RPC_URL);

// ─── BigNumber to hex 변환 함수 ──────────────────────────────────────
const toHex = (bn) => {
    if (!bn) return undefined;
    if (typeof bn === 'string') return bn;
    if (bn._isBigNumber) return bn._hex;
    return bn;
};

// ─── 트랜잭션 해시로 eth_createAccessList 파라미터 생성 ──────────────
async function buildParamsFromTxHash(txHash) {
    const tx = await alchemy.core.getTransaction(txHash);
    if (!tx) throw new Error(`Transaction not found: ${txHash}`);
    return [
        {
            from: tx.from,
            to: tx.to,
            value: toHex(tx.value),
            data: tx.data
        },
        "latest"
    ];
}

// ─── Access List 요청 및 결과 출력 ────────────────────────────────────
async function sendAccessListRequest(params) {
    const payload = {
        jsonrpc: "2.0",
        method: "eth_createAccessList",
        params,
        id: 1
    };

    console.log("eth_createAccessList 요청:");
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch(ALCHEMY_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log("Access List 응답:");
    console.log(JSON.stringify(result, null, 2));

    if (result?.result?.accessList?.length > 0) {
        await logStorageAccess(result.result.accessList);
    } else {
        console.log("Access List가 비어 있거나 형식이 올바르지 않습니다.");
    }
}

// ─── Access List의 address/storageKey별 스토리지 값 조회 및 출력 ──────
async function logStorageAccess(accessList) {
    console.log("\n=== Access List 기반 스토리지 조회 시작 ===");
    for (const { address, storageKeys } of accessList) {
        console.log(`\n-- Address: ${address} --`);
        if (!Array.isArray(storageKeys) || storageKeys.length === 0) {
            console.log("  조회할 storageKey가 없습니다.");
            continue;
        }
        for (const key of storageKeys) {
            try {
                const value = await ethProvider.getStorage(address, key);
                console.log(`  StorageKey: ${key} -> Value: ${value}`);
            } catch (err) {
                console.error(`  [Error] address=${address}, storageKey=${key} 조회 중 오류:`, err);
            }
        }
    }
    console.log("=== 스토리지 조회 완료 ===\n");
}

// ─── 메인 함수 ────────────────────────────────────────────────────────
async function main() {
    const txHash = "0xee6285bebb260c120525d4e09c6fa783a8ddb6beeee89468ec9a2cc9a9a98ce8"; // 필요에 따라 변경
    console.log("txHash:", txHash);

    try {
        const params = await buildParamsFromTxHash(txHash);
        await sendAccessListRequest(params);
    } catch (err) {
        console.error("실행 중 오류:", err);
    }
}

main();

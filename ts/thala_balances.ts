import * as dotenv from "dotenv";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

dotenv.config();

const config = new AptosConfig({ network: Network.MAINNET });
// Aptos is the main entrypoint for all functions
const client = new Aptos(config);

const args = process.argv.slice(2);
const THALA_V1_FARMING_ADDRESS = args[0];
const THALASWAP_V2_ADDRESS = args[1];
const SUSDE_LPT_PID = args[2];
const SUSDE_LPT_ADDRESS = args[3];
const decimals = Number(args[4]);
const block = Number(args[5]);
const user_addresses: Array<string> = JSON.parse(args[6]);

async function getStrategy() {
    // iterate over all users and get their susde balance
    const user_balances: Record<string, number> = {};
    for (const address of user_addresses) {
        const [stake_amount, _boosted_stake_amount, _boost_multiplier] = await client.view<string[]>({
            payload: {
                function: `${THALA_V1_FARMING_ADDRESS}::farming::stake_amount`,
                functionArguments: [address, Number(SUSDE_LPT_PID)],
            },
            options: { ledgerVersion: block },
        });

        // 1. preview how much sUSDE/USDC is returned when 1 LPT is removed (the pool LPT distribution)
        let [lptPreview] = await client.view<any[]>({
            payload: {
                function: `${THALASWAP_V2_ADDRESS}::pool::preview_remove_liquidity`,
                functionArguments: [SUSDE_LPT_ADDRESS, SUSDE_LPT_ADDRESS, 100000000],
            },
            options: { ledgerVersion: block },
        });

        // 2. preview the sUSDE/USDC exchange rate of 1 sUSDE
        let [swapPreview] = await client.view<any[]>({
            payload: {
                function: `${THALASWAP_V2_ADDRESS}::pool::preview_swap_exact_in_metastable`,
                functionArguments: [SUSDE_LPT_ADDRESS, "0xb30a694a344edee467d9f82330bbe7c3b89f440a1ecd2da1f3bca266560fce69", "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b", 100000000, "0x1"],
            },
            options: { ledgerVersion: block },
        });

        // lpt Price = sUSDE/USDC exchange rate * (% of sUSDE in pool) + (USDC price ($1) * (% of USDC in pool))
        let lptPrice = ((lptPreview.withdrawn_amounts[0] / 100000000 * swapPreview.amount_out / 100000000) + (lptPreview.withdrawn_amounts[1] / 100000000)) * 100;

        user_balances[address] = scaleDownByDecimals(
            Number(stake_amount),
            decimals
        ) * lptPrice;
    }

    console.log(JSON.stringify(user_balances));
}

function scaleDownByDecimals(value: number, decimals: number) {
    return value / 10 ** decimals;
}

const strategy = getStrategy().catch(console.error);
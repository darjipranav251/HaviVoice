import { isNextRouterError } from "next/dist/client/components/is-next-router-error";
import { redirect } from "next/navigation";

import { getWorkflowCountApiV1WorkflowCountGet } from "@/client/sdk.gen";
import { getServerAccessToken,getServerAuthProvider, getServerUser } from "@/lib/auth/server";
import logger from '@/lib/logger';
import { getRedirectUrl } from "@/lib/utils";

export const dynamic = 'force-dynamic';

export default async function AfterSignInPage() {
    redirect('/overview');
}

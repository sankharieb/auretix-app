import AdvisorBriefingSurface from "../../components/advisor-briefing-surface";
import { buildAdvisorFeed } from "../../lib/advisor-feed/composer";
import { getRequestContext } from "../../lib/auth-context";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function AppOverviewPage() {
  const context = await getRequestContext();
  const supabase = await createSupabaseServerClient();
  const companyId = context.company?.id || "company_demo";
  const userName = context.user?.name || context.user?.email || "Michel";
  let feed;

  try {
    feed = await buildAdvisorFeed({
      companyId,
      workspaceId: null,
      supabase,
    });
  } catch {
    feed = await buildAdvisorFeed({
      companyId,
      workspaceId: null,
      records: {},
    });
  }

  return <AdvisorBriefingSurface feed={feed} userName={userName} />;
}

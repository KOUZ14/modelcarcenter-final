import { HomeMarketplace } from "@/components/home-marketplace";
import { modelHuntEmailEnabled } from "@/lib/model-hunt-capabilities";

export default function HomePage() {
  return <HomeMarketplace emailAlertsEnabled={modelHuntEmailEnabled()}/>;
}

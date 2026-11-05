import { HomeMarketplace } from "@/components/home-marketplace";
import { modelHuntEmailEnabled } from "@/lib/model-hunt-capabilities";
import "@/components/discovery.css";

export default function HomePage() {
  return <HomeMarketplace emailAlertsEnabled={modelHuntEmailEnabled()}/>;
}

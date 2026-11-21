// Renders a full-page app view tab (dashboard, graph, flashcards...). Each
// view is loaded on first use to keep startup fast.
import { Match, Suspense, Switch, lazy } from "solid-js";
import { t } from "../i18n";
import { viewOf } from "../state/views";

const Dashboard = lazy(() => import("./dashboard/Dashboard"));
const GraphView = lazy(() => import("./graph/GraphView"));
const Flashcards = lazy(() => import("./flashcards/Flashcards"));
const Projects = lazy(() => import("./projects/Projects"));
const MediaShelf = lazy(() => import("./media/MediaShelf"));
const ZenStudio = lazy(() => import("./focus/ZenStudio"));

export function AppViewHost(props: { path: string }) {
  return (
    <div class="app-view" data-view={viewOf(props.path)}>
      <Suspense fallback={<p class="empty">{t("loading")}</p>}>
        <Switch>
          <Match when={viewOf(props.path) === "dashboard"}><Dashboard /></Match>
          <Match when={viewOf(props.path) === "graph"}><GraphView /></Match>
          <Match when={viewOf(props.path) === "flashcards"}><Flashcards /></Match>
          <Match when={viewOf(props.path) === "projects"}><Projects /></Match>
          <Match when={viewOf(props.path) === "media"}><MediaShelf /></Match>
          <Match when={viewOf(props.path) === "zen"}><ZenStudio /></Match>
        </Switch>
      </Suspense>
    </div>
  );
}

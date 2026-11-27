// Renders a full-page app view tab (dashboard, graph, flashcards...). Each
// view is loaded on first use to keep startup fast.
import { Match, Suspense, Switch, lazy } from "solid-js";
import { t } from "../i18n";
import { viewOf } from "../state/views";
import { closeTab } from "../state/vault";
import { setZenPage } from "../state/ui";
import { StartPage } from "./StartPage";

const Dashboard = lazy(() => import("./dashboard/Dashboard"));
const GraphView = lazy(() => import("./graph/GraphView"));
const Flashcards = lazy(() => import("./flashcards/Flashcards"));
const Projects = lazy(() => import("./projects/Projects"));
const MediaShelf = lazy(() => import("./media/MediaShelf"));
const People = lazy(() => import("./people/People"));
/** Old saved "app:zen" tabs close and open the Zen page instead. */
function ZenRedirect(props: { path: string }) {
  queueMicrotask(() => { closeTab(props.path); setZenPage(true); });
  return null;
}

export function AppViewHost(props: { path: string }) {
  return (
    <div class="app-view" data-view={viewOf(props.path)}>
      <Suspense fallback={<p class="empty">{t("loading")}</p>}>
        <Switch>
          <Match when={viewOf(props.path) === "start"}><StartPage /></Match>
          <Match when={viewOf(props.path) === "dashboard"}><Dashboard /></Match>
          <Match when={viewOf(props.path) === "graph"}><GraphView /></Match>
          <Match when={viewOf(props.path) === "flashcards"}><Flashcards /></Match>
          <Match when={viewOf(props.path) === "projects"}><Projects /></Match>
          <Match when={viewOf(props.path) === "media"}><MediaShelf /></Match>
          <Match when={viewOf(props.path) === "people"}><People /></Match>
          <Match when={viewOf(props.path) === "zen"}><ZenRedirect path={props.path} /></Match>
        </Switch>
      </Suspense>
    </div>
  );
}

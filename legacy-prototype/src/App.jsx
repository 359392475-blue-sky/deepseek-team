import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import teamPageMock from "../concepts/chat-game-v3/team-space-page.png";
import {
  IconAgentPresetOutline16,
  IconBrowseOutline16,
  IconCheckOutline16,
  IconPauseOutline16,
  IconPlayOutline16,
  IconSendOutline16,
} from "./upstream-icons/index.tsx";
import { FlightRaidCanvas } from "./FlightRaidCanvas.jsx";

const INITIAL_MESSAGES = [
  {
    id: "seed-user-trishot",
    role: "user",
    body: "帮我实现战机的三向散射武器，持续 8 秒。",
    time: "20:48",
  },
  {
    id: "seed-assistant-trishot",
    role: "assistant",
    body: "已完成三向散射武器的实现，持续 8 秒，冷却 35 秒。",
    details: [
      "新增 WeaponType.TRISHOT 枚举与对应配置",
      "实现三向弹道逻辑（左偏 / 直线 / 右偏）",
      "整合到武器系统与 UI，支持持续计时与冷却",
    ],
    time: "20:48",
  },
  {
    id: "seed-user-nuke",
    role: "user",
    body: "再帮我设计一个清屏核弹，消灭全屏敌机。",
    time: "20:54",
  },
  {
    id: "seed-assistant-nuke",
    role: "assistant",
    body: "已实现清屏核弹，可消灭全屏敌机，冷却 90 秒。",
    details: [
      "新增 WeaponType.NUKE 枚举与配置",
      "实现全屏清除逻辑与爆炸特效",
      "整合到武器系统与 UI",
    ],
    time: "20:54",
  },
];

function formatTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function Navigation({ onOpenTeam }) {
  return (
    <nav aria-label="主导航" className="mode-rail">
      <img alt="DeepSeek" className="brand-logo" src="/assets/deepseek-mark.svg" />
      <div className="rail-actions">
        <button aria-current="page" className="rail-button active" type="button">
          <IconBrowseOutline16 className="rail-icon" size={29} />
          <span>对话</span>
        </button>
        <button className="rail-button" onClick={onOpenTeam} type="button">
          <IconAgentPresetOutline16 className="rail-icon" size={29} />
          <span>团队</span>
          <b aria-label="团队有新动态" className="unread-dot" />
        </button>
      </div>
      <img alt="蓝天的头像" className="profile-avatar" src="/assets/user-avatar.png" />
    </nav>
  );
}

function AssistantMark() {
  return <img alt="" aria-hidden="true" className="assistant-mark" src="/assets/deepseek-mark.svg" />;
}

function Message({ message }) {
  if (message.role === "user") {
    return (
      <article className="message message-user">
        <p>{message.body}</p>
        <time>{message.time}</time>
      </article>
    );
  }

  return (
    <article className="message message-assistant">
      <AssistantMark />
      <div className="assistant-copy">
        <p>{message.body}</p>
        {message.details?.length ? (
          <ul>
            {message.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        ) : null}
        <time>{message.time}</time>
      </div>
    </article>
  );
}

function ConversationPanel({ agentStatus, messages, onSend, rewardNotice }) {
  const [draft, setDraft] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, rewardNotice]);

  const submit = () => {
    const query = draft.trim();
    if (!query) return;
    onSend(query);
    setDraft("");
  };

  return (
    <section aria-label="我的 Codex 对话" className="conversation-panel">
      <header className="conversation-header">
        <h1>我的 Codex</h1>
        <p><span className={`status-dot ${agentStatus === "已回复" ? "done" : ""}`} />{agentStatus}</p>
      </header>

      <div aria-live="polite" className="message-list" ref={listRef}>
        {messages.map((message) => <Message key={message.id} message={message} />)}
        {rewardNotice ? (
          <div className="query-reward" role="status">
            <span aria-hidden="true"><IconCheckOutline16 size={12} /></span>
            Query 已换成{rewardNotice === "nuke" ? "清屏核弹" : "强化火力"}
          </div>
        ) : null}
      </div>

      <form className="composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <textarea
          aria-label="输入消息"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="输入消息，Enter 发送"
          rows="1"
          value={draft}
        />
        <button aria-label="发送 Query" className="send-button" disabled={!draft.trim()} type="submit">
          <IconSendOutline16 aria-hidden="true" size={24} />
        </button>
      </form>
    </section>
  );
}

function WeaponSlot({ inventory, onUse }) {
  const activeType = inventory.nuke > 0 ? "nuke" : inventory.enhanced > 0 ? "enhanced" : null;
  const count = inventory.nuke + inventory.enhanced;

  return (
    <button
      aria-label={activeType ? `使用${activeType === "nuke" ? "清屏核弹" : "强化火力"}，剩余 ${count}` : "暂无特殊武器"}
      className={`weapon-slot ${activeType ? "ready" : "empty"}`}
      disabled={!activeType}
      onClick={onUse}
      type="button"
    >
      <img alt="" src="/assets/special-weapon-capsule.png" />
      <span>{activeType === "enhanced" ? "强化火力" : "清屏核弹"} × {count}</span>
    </button>
  );
}

function GamePanel({ inventory, metrics, onMetrics, onTogglePause, onUseWeapon, paused, supplyFlight, weaponEvent }) {
  return (
    <section aria-label="飞机大战" className="game-panel">
      <header className="game-hud">
        <div className="hud-stat lives">生命 <strong>{metrics.lives}</strong></div>
        <div className="hud-divider" />
        <div className="hud-stat score">本局 <strong>{String(metrics.score).padStart(5, "0")}</strong></div>
        <button aria-label={paused ? "继续游戏" : "暂停游戏"} className="pause-button" onClick={onTogglePause} type="button">
          {paused ? <IconPlayOutline16 aria-hidden="true" size={21} /> : <IconPauseOutline16 aria-hidden="true" size={21} />}
        </button>
        <WeaponSlot inventory={inventory} onUse={onUseWeapon} />
      </header>

      <div className={`flight-field ${paused ? "is-paused" : ""}`}>
        <FlightRaidCanvas onMetrics={onMetrics} paused={paused} weaponEvent={weaponEvent} />
        {supplyFlight ? (
          <div className="supply-flight" key={supplyFlight}>
            <span className="supply-trail" />
            <img alt="新获得的特殊武器飞向武器槽" src="/assets/special-weapon-capsule.png" />
          </div>
        ) : null}
        {paused ? <div className="pause-notice">已暂停</div> : null}
      </div>

      <footer className="game-controls">
        <span>左右键或鼠标移动</span>
        <span><i className="control-dot" />自动射击</span>
        <span><kbd>Space</kbd> 使用</span>
        <small>游戏战况不代表项目进度</small>
      </footer>
    </section>
  );
}

function TeamDesignPreview({ onClose }) {
  return (
    <div aria-label="团队页面视觉预览" aria-modal="true" className="team-preview" role="dialog">
      <div className="team-preview-toolbar">
        <div>
          <strong>团队页面 · 视觉预览</strong>
          <span>信息架构待你确认后再接入功能</span>
        </div>
        <button onClick={onClose} type="button">返回对话</button>
      </div>
      <div className="team-preview-canvas">
        <img alt="团队页面设计稿：成员状态、团队云空间、文件列表和版本详情" src={teamPageMock} />
      </div>
    </div>
  );
}

export function App() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [agentStatus, setAgentStatus] = useState("正在思考");
  const [inventory, setInventory] = useState({ nuke: 1, enhanced: 0 });
  const [metrics, setMetrics] = useState({ lives: 3, score: 3120, enhanced: false });
  const [paused, setPaused] = useState(false);
  const [rewardNotice, setRewardNotice] = useState("nuke");
  const [supplyFlight, setSupplyFlight] = useState(0);
  const [weaponEvent, setWeaponEvent] = useState({ id: 0, type: "idle" });
  const [teamPreviewOpen, setTeamPreviewOpen] = useState(false);
  const seenQueryIds = useRef(new Set(INITIAL_MESSAGES.filter(({ role }) => role === "user").map(({ id }) => id)));
  const querySequence = useRef(0);

  const currentWeapon = useMemo(() => {
    if (inventory.nuke > 0) return "nuke";
    if (inventory.enhanced > 0) return "enhanced";
    return null;
  }, [inventory]);

  const useWeapon = useCallback(() => {
    if (!currentWeapon) return;
    setInventory((current) => ({ ...current, [currentWeapon]: Math.max(0, current[currentWeapon] - 1) }));
    setWeaponEvent((current) => ({ id: current.id + 1, type: currentWeapon }));
  }, [currentWeapon]);

  useEffect(() => {
    const handleSpace = (event) => {
      const editable = event.target instanceof HTMLElement
        && (event.target.matches("input, textarea, [contenteditable='true']"));
      if (event.code !== "Space" || editable || teamPreviewOpen) return;
      event.preventDefault();
      useWeapon();
    };
    window.addEventListener("keydown", handleSpace);
    return () => window.removeEventListener("keydown", handleSpace);
  }, [teamPreviewOpen, useWeapon]);

  const sendQuery = (query) => {
    querySequence.current += 1;
    const eventId = `query-${Date.now()}-${querySequence.current}`;
    if (seenQueryIds.current.has(eventId)) return;
    seenQueryIds.current.add(eventId);

    const reward = querySequence.current % 2 === 1 ? "enhanced" : "nuke";
    setMessages((current) => [...current, { id: eventId, role: "user", body: query, time: formatTime() }]);
    setInventory((current) => ({ ...current, [reward]: current[reward] + 1 }));
    setRewardNotice(reward);
    setSupplyFlight((current) => current + 1);
    setAgentStatus("正在思考");

    window.setTimeout(() => setRewardNotice(null), 2100);
    window.setTimeout(() => {
      setMessages((current) => [...current, {
        id: `${eventId}-reply`,
        role: "assistant",
        body: "收到。我已经把这轮需求整理为可执行项，游戏会继续运行。",
        details: ["已保留当前战局", "本轮 Query 只兑换 1 个特殊武器"],
        time: formatTime(),
      }]);
      setAgentStatus("已回复");
    }, 2200);
  };

  return (
    <main className="app-shell">
      <Navigation onOpenTeam={() => setTeamPreviewOpen(true)} />
      <div className="unified-workspace">
        <ConversationPanel agentStatus={agentStatus} messages={messages} onSend={sendQuery} rewardNotice={rewardNotice} />
        <GamePanel
          inventory={inventory}
          metrics={metrics}
          onMetrics={setMetrics}
          onTogglePause={() => setPaused((current) => !current)}
          onUseWeapon={useWeapon}
          paused={paused}
          supplyFlight={supplyFlight}
          weaponEvent={weaponEvent}
        />
      </div>
      {teamPreviewOpen ? <TeamDesignPreview onClose={() => setTeamPreviewOpen(false)} /> : null}
    </main>
  );
}

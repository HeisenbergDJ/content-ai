"use client";

import { Sparkles } from "lucide-react";
import { useApp } from "@/lib/AppContext";

export default function SkillsPage() {
  const { data } = useApp();
  const skills   = data?.skills || [];

  return (
    <section className="page">
      <div className="content">
        <div className="section-header">
          <div>
            <div className="section-title">Skill中心</div>
            <div className="list-meta">Skill = 蒸馏的员工能力</div>
          </div>
          <button className="btn btn-primary"><Sparkles size={13} /> 蒸馏新 Skill</button>
        </div>

        <div className="skill-grid">
          {skills.map((s, i) => (
            <div className="skill-card" key={s.id}>
              <div className="skill-card-header">
                <div
                  className="skill-icon"
                  style={{ background: i % 2 ? "#FCE7F3" : "#EEF2FF", color: i % 2 ? "#DB2777" : "#4F46E5" }}
                >
                  <Sparkles size={17} />
                </div>
                <div>
                  <div className="skill-name">{s.name}</div>
                  <div className="skill-source">
                    {s.source?.employeeName ? `来源：${s.source.employeeName}` : s.type}
                  </div>
                </div>
              </div>
              <div className="skill-desc">
                {s.description || "基于历史创作记录和偏好沉淀，可在创作流程中调用。"}
              </div>
              <div className="skill-meta">
                <span>{s.category}</span>
                <span>{s.status}</span>
                <span>{s.currentVersion || "v1"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

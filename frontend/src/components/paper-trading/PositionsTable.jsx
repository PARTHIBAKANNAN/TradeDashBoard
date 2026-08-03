import React from "react";
import { LineChart } from "lucide-react";
import Card from "../ui/Card.jsx";
import PositionRow from "./PositionRow.jsx";

export default function PositionsTable({ positions }) {
  return (
    <Card
      title="Positions"
      subtitle="Open + pending paper orders"
      icon={LineChart}
      bodyClassName="p-0"
    >
      {positions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface3/60 border-b border-subtle">
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">
                  Stock
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                  Side
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  Qty
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  Entry / Limit
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  LTP
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  SL / Target
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  P&amp;L
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((order) => (
                <PositionRow key={order.id} order={order} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center">
          <LineChart size={28} className="mx-auto mb-2 text-faint" />
          <p className="text-faint text-sm">No open or pending orders</p>
        </div>
      )}
    </Card>
  );
}

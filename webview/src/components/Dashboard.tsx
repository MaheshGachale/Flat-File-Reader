import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import html2canvas from 'html2canvas';

interface DashboardProps {
  data: any[][];
  columns: string[];
  onClose: () => void;
}

type ChartType = 'bar' | 'line' | 'pie' | 'scatter';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0'];

const Dashboard: React.FC<DashboardProps> = ({ data, columns, onClose }) => {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [chartType, setChartType] = useState<ChartType>('bar');
  const chartRef = useRef<HTMLDivElement>(null);

  // Convert data to chart format
  const chartData = useMemo(() => {
    if (selectedColumns.length === 0) return [];

    // For simplicity, use first column as X-axis, others as Y-series
    const xColumn = selectedColumns[0];
    const yColumns = selectedColumns.slice(1);

    if (yColumns.length === 0) return [];

    const xIndex = columns.indexOf(xColumn);
    const yIndices = yColumns.map(col => columns.indexOf(col));

    return data.map(row => {
      const item: any = { [xColumn]: row[xIndex] };
      yColumns.forEach((col, i) => {
        const value = row[yIndices[i]];
        item[col] = typeof value === 'number' ? value : parseFloat(value) || 0;
      });
      return item;
    });
  }, [data, columns, selectedColumns]);

  const handleColumnToggle = (column: string) => {
    setSelectedColumns(prev =>
      prev.includes(column)
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const handleDownload = () => {
    console.log('Download Chart button clicked');

    if (!chartRef.current) {
      console.log('Download cancelled: No chart container found');
      alert('No chart to download');
      return;
    }

    console.log('Starting chart download process with 300ms delay');

    // Wait a bit to ensure rendering complete
    setTimeout(() => {
      console.log('Delay completed, starting html2canvas capture');
      try {
        html2canvas(chartRef.current!, {
          backgroundColor: '#FFFFFF',
          scale: 2,
          useCORS: false,
          allowTaint: false,
          width: chartRef.current!.offsetWidth,
          height: chartRef.current!.offsetHeight,
          logging: false,
          foreignObjectRendering: false,
          removeContainer: true
        }).then((canvas) => {
          console.log('html2canvas capture successful, creating download link');
          const link = document.createElement('a');
          link.download = 'dashboard-chart.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          console.log('Download link clicked, chart download initiated');
        }).catch((error) => {
          console.error('Error downloading chart:', error);
          alert('Failed to download chart');
        });
      } catch (error) {
        console.error('Error downloading chart:', error);
        alert('Failed to download chart');
      }
    }, 300); // slight delay ensures chart rendered
  };

  const renderChart = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400">
          Select columns to visualize data
        </div>
      );
    }

    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 5 }
    };

    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey={selectedColumns[0]} stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              {selectedColumns.slice(1).map((col, index) => (
                <Bar key={col} dataKey={col} fill={COLORS[index % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey={selectedColumns[0]} stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              {selectedColumns.slice(1).map((col, index) => (
                <Line
                  key={col}
                  type="monotone"
                  dataKey={col}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'pie':
        // For pie chart, use first Y column only
        const pieData = chartData.map(item => ({
          name: item[selectedColumns[0]],
          value: item[selectedColumns[1]] || 0
        }));

        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '6px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey={selectedColumns[0]} stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              {selectedColumns.slice(1).map((col, index) => (
                <Scatter
                  key={col}
                  name={col}
                  dataKey={col}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-6xl max-h-[90vh] overflow-hidden bg-gray-900 border border-gray-700 rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Data Dashboard</h2>
              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={handleDownload}
                  disabled={chartData.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors disabled:cursor-not-allowed"
                >
                  Download Chart
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md font-medium transition-colors"
                >
                  Back
                </motion.button>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Column Selection */}
              <div className="lg:col-span-1">
                <h3 className="text-lg font-medium text-white mb-4">Select Columns</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {columns.map(column => (
                    <label key={column} className="flex items-center space-x-2 text-gray-300">
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(column)}
                        onChange={() => handleColumnToggle(column)}
                        className="rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">{column}</span>
                    </label>
                  ))}
                </div>

                {/* Chart Type Selection */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-white mb-4">Chart Type</h3>
                  <select
                    value={chartType}
                    onChange={(e) => setChartType(e.target.value as ChartType)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="bar">Bar Chart</option>
                    <option value="line">Line Chart</option>
                    <option value="pie">Pie Chart</option>
                    <option value="scatter">Scatter Plot</option>
                  </select>
                </div>
              </div>

              {/* Chart Display */}
              <div className="lg:col-span-3">
                <div ref={chartRef} className="bg-gray-800 rounded-lg p-4">
                  {renderChart()}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Dashboard;

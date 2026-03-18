import React from 'react';
import { PnLReport } from './components/pl/PnLReport';
import './styles/pnl.css';

const App: React.FC = () => {
  return (
    <div className="app">
      <PnLReport />
    </div>
  );
};

export default App;

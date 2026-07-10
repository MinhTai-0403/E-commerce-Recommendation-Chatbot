import { useState, useEffect } from 'react';
import './FlashSale.css';
import { flashSaleTabs, flashSaleDates, flashSaleTimeSlots, flashSaleProducts } from '../../data/mockData';
import ProductCard from '../ProductCard/ProductCard';

export default function FlashSale() {
  const [activeTab, setActiveTab] = useState('flashsale');
  const [activeDate, setActiveDate] = useState(() => flashSaleDates.find((date) => date.active)?.id || flashSaleDates[0]?.id);
  const [activeTimeSlot, setActiveTimeSlot] = useState(() => flashSaleTimeSlots.find((slot) => slot.active)?.id || flashSaleTimeSlots[0]?.id);
  const [timeLeft, setTimeLeft] = useState({ hours: '00', minutes: '01', seconds: '38', milliseconds: '25' });

  useEffect(() => {
    const timer = setInterval(() => {
      // Simulate countdown
      setTimeLeft(prev => {
        let ms = parseInt(prev.milliseconds) - 1;
        let s = parseInt(prev.seconds);
        let m = parseInt(prev.minutes);
        let h = parseInt(prev.hours);

        if (ms < 0) {
          ms = 99;
          s -= 1;
        }
        if (s < 0) {
          s = 59;
          m -= 1;
        }
        if (m < 0) {
          m = 59;
          h -= 1;
        }
        if (h < 0) {
          h = 23;
        }

        return {
          hours: h.toString().padStart(2, '0'),
          minutes: m.toString().padStart(2, '0'),
          seconds: s.toString().padStart(2, '0'),
          milliseconds: ms.toString().padStart(2, '0')
        };
      });
    }, 10);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="flash-sale section-gap" id="flash-sale-section">
      <div className="container">
        <div className="flash-sale-wrapper">
          {/* Main Tabs */}
          <div className="flash-sale-main-tabs">
            {flashSaleTabs.map(tab => (
              <button 
                key={tab.id}
                className={`fs-main-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.name}
              </button>
            ))}
          </div>

          <div className="flash-sale-content">
            {/* Header: Dates, Times and Countdown */}
            <div className="flash-sale-header">
              <div className="fs-dates">
                {flashSaleDates.map(date => (
                  <button
                    key={date.id}
                    type="button"
                    className={`fs-date-btn ${activeDate === date.id ? 'active' : ''}`}
                    onClick={() => setActiveDate(date.id)}
                  >
                    {date.date}
                  </button>
                ))}
              </div>
              <div className="fs-header-right">
                <span className="countdown-label">BẮT ĐẦU SAU</span>
                <div className="countdown-timer">
                  <span className="time-box">{timeLeft.hours}</span>
                  <span className="time-colon">:</span>
                  <span className="time-box">{timeLeft.minutes}</span>
                  <span className="time-colon">:</span>
                  <span className="time-box">{timeLeft.seconds}</span>
                  <span className="time-colon">:</span>
                  <span className="time-box ms">{timeLeft.milliseconds}</span>
                </div>
              </div>
            </div>

            <div className="fs-time-slots">
              {flashSaleTimeSlots.map(slot => (
                <button
                  key={slot.id}
                  type="button"
                  className={`fs-time-btn ${activeTimeSlot === slot.id ? 'active' : ''}`}
                  onClick={() => setActiveTimeSlot(slot.id)}
                >
                  {slot.time}
                </button>
              ))}
            </div>

            {/* Product List */}
            <div className="flash-sale-products">
              {flashSaleProducts.map((product) => (
                <div key={product.id} className="fs-product-wrapper">
                  <ProductCard product={product} />
                  <div className="fs-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${(product.sold / product.total) * 100}%` }}
                      ></div>
                    </div>
                    <span className="progress-text">Đã bán {product.sold}/{product.total} suất</span>
                    <span className="progress-icon">🔥</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

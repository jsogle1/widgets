import React, { useState } from 'react';
import { JimuMapViewComponent } from 'jimu-arcgis';

const Widget = () => {
  const [clickedPoint, setClickedPoint] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);

  const handleMapClick = async (jimuMapView) => {
    try {
      // Get the map view from JimuMapViewComponent
      const mapView = await jimuMapView.view;

      // Listen for a single click event on the map view
      const clickHandler = mapView.on('click', async (event) => {
        // Extract the mapPoint from the click event.
        const { mapPoint } = event;

        // Set the clicked point, latitude, and longitude
        setClickedPoint(mapPoint);
        setLatitude(mapPoint.latitude.toFixed(3));
        setLongitude(mapPoint.longitude.toFixed(3));

        // Remove the click handler after a single click
        clickHandler.remove();
      });
    } catch (error) {
      console.error('Error handling map click:', error);
    }
  };

  return (
    <div>
      <h1>Site Location</h1>

      {/* Render the JimuMapViewComponent to listen for map clicks */}
      <JimuMapViewComponent onActiveViewChange={handleMapClick} />

      {/* Render the clicked point information */}
      {clickedPoint && (
        <table>
          <caption>Site Location</caption>
          <tbody>
            <tr>
              <th>Latitude</th>
              <td>{latitude}</td>
            </tr>
            <tr>
              <th>Longitude</th>
              <td>{longitude}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Widget;

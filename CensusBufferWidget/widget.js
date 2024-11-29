import React, { useEffect } from 'react';
import MapView from '@arcgis/core/views/MapView';
import WebMap from '@arcgis/core/WebMap';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';

export default function CensusBufferWidget() {
  let view;
  const bufferDistance = 1000; // Buffer distance in meters
  const unit = 'meters';

  useEffect(() => {
    // Initialize the WebMap and MapView
    const webmap = new WebMap({
      portalItem: {
        id: '<YOUR-WEBMAP-ID>' // Replace with your WebMap ID
      }
    });

    view = new MapView({
      container: 'mapViewDiv',
      map: webmap
    });

    // Add click event to the MapView
    view.on('click', (event) => {
      view.hitTest(event).then((response) => {
        if (response.results.length > 0) {
          const feature = response.results[0].graphic;
          processFeature(feature.geometry);
        } else {
          console.log('No feature selected.');
        }
      });
    });
  }, []);

  // Step 1: Process the clicked feature and create a buffer
  function processFeature(geometry) {
    const bufferGeometry = geometryEngine.buffer(geometry, bufferDistance, unit);
    if (bufferGeometry) {
      clipCensusLayer(bufferGeometry);
    } else {
      console.error('Buffer creation failed.');
    }
  }

  // Step 2: Clip the census layer using the buffer geometry
  function clipCensusLayer(bufferGeometry) {
    const censusLayer = new FeatureLayer({
      url: '<YOUR-CENSUS-LAYER-URL>' // Replace with your census layer URL
    });

    censusLayer.queryFeatures({
      geometry: bufferGeometry,
      spatialRelationship: 'intersects',
      outFields: ['*'],
      returnGeometry: true
    }).then((result) => {
      const clippedFeatures = result.features.map((feature) => {
        const clippedGeometry = geometryEngine.intersect(feature.geometry, bufferGeometry);
        if (clippedGeometry) {
          return { ...feature, clippedGeometry };
        }
        return null;
      }).filter((f) => f !== null);

      recalculateStatistics(clippedFeatures);
    }).catch((error) => {
      console.error('Error querying census layer:', error);
    });
  }

  // Step 3: Recalculate statistics based on clipped geometry
  function recalculateStatistics(clippedFeatures) {
    const updatedFeatures = clippedFeatures.map((feature) => {
      const originalArea = geometryEngine.geodesicArea(feature.geometry, 'square-meters');
      const clippedArea = geometryEngine.geodesicArea(feature.clippedGeometry, 'square-meters');
      const proportion = clippedArea / originalArea;

      // Update attributes based on the proportion
      return {
        ...feature,
        attributes: {
          ...feature.attributes,
          population: feature.attributes.population * proportion // Adjust for your attribute field
        }
      };
    });

    updateResultsOnMap(updatedFeatures);
  }

  // Step 4: Display the clipped results and updated statistics on the map
  function updateResultsOnMap(features) {
    const resultsLayer = new FeatureLayer({
      source: features.map((feature) => ({
        geometry: feature.clippedGeometry,
        attributes: feature.attributes
      })),
      objectIdField: 'OBJECTID',
      fields: [
        { name: 'OBJECTID', alias: 'Object ID', type: 'oid' },
        { name: 'population', alias: 'Population', type: 'double' } // Adjust for your attribute fields
      ]
    });

    view.map.add(resultsLayer);
    console.log('Results layer added to the map.');
  }

  return (
    <div>
      <div id="mapViewDiv" style={{ height: '500px', width: '100%' }}></div>
      <div id="instructions">
        <p>Click on a map feature to buffer, clip, and recalculate census statistics.</p>
      </div>
    </div>
  );
}
